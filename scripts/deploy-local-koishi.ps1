param(
  [string]$InstancePath = "$env:APPDATA\Koishi\Desktop\data\instances\default"
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$PackageJson = Join-Path $Root "package.json"
$Package = [System.IO.File]::ReadAllText($PackageJson, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$LocalDir = Join-Path $InstancePath ".yarn\local"

if (!(Test-Path $InstancePath)) {
  throw "Koishi instance path does not exist: $InstancePath"
}

if (!(Test-Path $LocalDir)) {
  New-Item -ItemType Directory -Force -Path $LocalDir | Out-Null
}

Push-Location $Root
try {
  Invoke-Step "build package" { npm run build }
  Invoke-Step "check package" { npm run check:package }

  Write-Host ""
  Write-Host "==> pack tarball" -ForegroundColor Cyan
  $packOutput = npm pack --json
  if ($LASTEXITCODE) {
    throw "npm pack failed with exit code $LASTEXITCODE"
  }
  $packInfo = $packOutput | Out-String | ConvertFrom-Json
  $Tarball = Join-Path $Root $packInfo[0].filename
  if (!(Test-Path $Tarball)) {
    throw "Generated tarball not found: $Tarball"
  }

  $Destination = Join-Path $LocalDir $packInfo[0].filename
  Copy-Item -LiteralPath $Tarball -Destination $Destination -Force
  Write-Host "Copied $($packInfo[0].filename) to $LocalDir"
}
finally {
  Pop-Location
}

Push-Location $InstancePath
try {
  $InstancePackageJson = Join-Path $InstancePath "package.json"
  $InstancePackage = [System.IO.File]::ReadAllText($InstancePackageJson, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if (!$InstancePackage.dependencies) {
    $InstancePackage | Add-Member -MemberType NoteProperty -Name "dependencies" -Value ([pscustomobject]@{})
  }
  $DependencyValue = "file:.yarn/local/$($packInfo[0].filename)"
  $Dependency = $InstancePackage.dependencies.PSObject.Properties[$Package.name]
  if ($Dependency) {
    $Dependency.Value = $DependencyValue
  } else {
    $InstancePackage.dependencies | Add-Member -MemberType NoteProperty -Name $Package.name -Value $DependencyValue
  }
  $InstanceJson = $InstancePackage | ConvertTo-Json -Depth 100
  [System.IO.File]::WriteAllText($InstancePackageJson, $InstanceJson + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

  Invoke-Step "install in Koishi instance" { corepack yarn install }

  Write-Host ""
  Write-Host "==> verify installed package" -ForegroundColor Cyan
  $installedName = node -p "require('./node_modules/$($Package.name)/package.json').name"
  $installedVersion = node -p "require('./node_modules/$($Package.name)/package.json').version"
  if ($installedName -ne $Package.name) {
    throw "Installed package mismatch: expected $($Package.name), got $installedName"
  }
  Write-Host "Installed $installedName@$installedVersion in $InstancePath" -ForegroundColor Green
}
finally {
  Pop-Location
}

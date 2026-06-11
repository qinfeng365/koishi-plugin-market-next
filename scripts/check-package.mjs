import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

const npm = 'npm'
const requiredFiles = [
  'dist/index.js',
  'dist/index.css',
  'dist/style.css',
  'lib/shared/bundle.d.ts',
  'lib/shared/bundle.js',
  'lib/shared/bundle.mjs',
]

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    throw new Error(`Missing build artifact: ${file}`)
  }
}

const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
if (hash('dist/index.css') !== hash('dist/style.css')) {
  throw new Error('dist/index.css and dist/style.css must be identical')
}

const {
  hasBundleKeyword,
  isBundlePackageName,
  parseBundleManifest,
  validateBundleManifest,
} = await import('../lib/shared/bundle.mjs')
const bundle = parseBundleManifest(pkg.koishi?.bundle)
const bundleMarked = isBundlePackageName(pkg.name) || hasBundleKeyword(pkg.keywords)
if (bundleMarked || pkg.koishi?.bundle) {
  const validation = validateBundleManifest(pkg.name, bundle, {
    keyword: hasBundleKeyword(pkg.keywords),
  })
  for (const warning of validation.warnings) {
    console.warn(`[bundle warning] ${warning}`)
  }
  if (!validation.valid) {
    throw new Error(`Plugin bundle validation failed:\n${validation.errors.map(error => `- ${error}`).join('\n')}`)
  }
  for (const member of bundle.members) {
    const filename = tryResolvePackageJson(member.package)
    if (!filename) continue
    const memberPackage = JSON.parse(readFileSync(filename, 'utf8'))
    const memberBundle = parseBundleManifest(memberPackage.koishi?.bundle)
    if (memberBundle?.members.some(item => item.package.toLowerCase() === pkg.name.toLowerCase())) {
      throw new Error(`Plugin bundle has a direct cycle: ${pkg.name} <-> ${member.package}`)
    }
  }
  console.log(`Plugin bundle check passed for ${pkg.name}.`)
}

const output = execFileSync(npm, ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'inherit'],
})
const [pack] = JSON.parse(output)
const files = new Set(pack.files.map(file => file.path))

for (const file of requiredFiles) {
  if (!files.has(file)) {
    throw new Error(`Package tarball is missing: ${file}`)
  }
}

console.log(`Package artifact check passed for ${pack.name}@${pack.version}.`)

function tryResolvePackageJson(name) {
  try {
    return require.resolve(`${name}/package.json`, { paths: [process.cwd()] })
  } catch {
    return undefined
  }
}

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { satisfies } from 'semver'

export function getRuntimePackages(lock) {
  const paths = new Set()
  const queue = ['']
  for (const path of queue) {
    const pkg = lock.packages[path]
    const deps = { ...pkg.dependencies, ...pkg.optionalDependencies }
    for (const name of Object.keys(deps)) {
      let parent = path
      let found = false
      while (true) {
        const target = posix.join(parent, 'node_modules', name)
        if (lock.packages[target]) {
          found = true
          if (!paths.has(target)) {
            paths.add(target)
            queue.push(target)
          }
          break
        }
        if (!parent) break
        parent = posix.dirname(parent)
        if (parent === '.') parent = ''
        if (posix.basename(parent) === 'node_modules') {
          parent = posix.dirname(parent)
          if (parent === '.') parent = ''
        }
      }
      if (!found && !(name in (pkg.optionalDependencies ?? {}))) {
        throw new Error(`Missing runtime dependency in package-lock.json: ${path || '<root>'} -> ${name}`)
      }
    }
  }
  return paths
}

export function getRuntimeVulnerabilities(report, paths, packages) {
  return Object.values(report.vulnerabilities).flatMap(item => item.via.flatMap(via => {
    // npm's aggregate severity also includes vulnerable peers. Gate on the actual
    // advisory and installed runtime version, not the severity inherited from a host.
    if (typeof via !== 'object') return []
    const nodes = item.nodes.filter(path => paths.has(path)
      && satisfies(packages[path].version, via.range, { includePrerelease: true }))
    return nodes.length ? [{ ...via, name: item.name, nodes }] : []
  }))
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const lock = JSON.parse(readFileSync(join(cwd, 'package-lock.json'), 'utf8'))
  const paths = getRuntimePackages(lock)
  if (!process.env.npm_execpath) throw new Error('Run this check with npm run audit:package.')
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--json', '--registry=https://registry.npmjs.org'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  })
  if (result.error) throw result.error
  const report = JSON.parse(result.stdout)
  if (report.error || !report.vulnerabilities || ![0, 1].includes(result.status)) {
    throw new Error(`npm audit failed: ${JSON.stringify(report.error) || result.stderr}`)
  }
  const issues = getRuntimeVulnerabilities(report, paths, lock.packages)
  for (const item of issues) {
    console.log(`[${item.severity}] ${item.name}: ${item.nodes.filter(path => paths.has(path)).join(', ')}`)
    console.log(`  ${item.title}: ${item.url}`)
  }
  console.log(`Audited ${paths.size} runtime package paths: ${issues.length} advisories. The full ${Object.keys(report.vulnerabilities).length}-package report (including hosts and development tools) is available via audit:high.`)
  if (issues.some(item => item.severity === 'high' || item.severity === 'critical')) process.exitCode = 1
}

import { Dict } from 'koishi'
import type { PackageJson } from '@koishijs/registry'
import { randomUUID } from 'crypto'
import { promises as fsp } from 'fs'
import { satisfies } from 'semver'
import { classifyDependencySource } from '../shared'
import type { Dependency } from './installer-types'

export function applyDependencyOverrides(manifest: PackageJson, changes: Dict<string>): PackageJson {
  const dependencies = { ...(manifest.dependencies ?? {}) }
  for (const [name, request] of Object.entries(changes)) {
    if (request) dependencies[name] = request
    else delete dependencies[name]
  }
  return {
    ...manifest,
    dependencies: Object.fromEntries(Object.entries(dependencies).sort((a, b) => a[0].localeCompare(b[0]))),
  }
}

export async function writePackageManifest(
  filename: string,
  manifest: PackageJson,
  io: Pick<typeof fsp, 'writeFile' | 'rename' | 'rm'> = fsp,
) {
  const tempFile = `${filename}.${process.pid}.${randomUUID()}.tmp`
  try {
    await io.writeFile(tempFile, JSON.stringify(manifest, null, 2) + '\n')
    await io.rename(tempFile, filename)
  } finally {
    await io.rm(tempFile, { force: true }).catch(() => undefined)
  }
}

export interface PackageManagerRequirement {
  changes: Dict<string>
  currentDependencies: Dict<string>
  currentLocalDeps: Dict<Dependency>
  nextLocalDeps: Dict<Dependency>
  forced?: boolean
}

export interface DependencyRuntimeChange {
  name: string
  changes: Dict<string>
  previousDependencies: Dict<string>
  previousLocalDeps: Dict<Dependency>
  nextLocalDeps: Dict<Dependency>
}

export function requiresPackageManager(input: PackageManagerRequirement) {
  const {
    changes,
    currentDependencies,
    currentLocalDeps,
    nextLocalDeps,
    forced,
  } = input
  if (forced) return true
  for (const name in changes) {
    const nextRequest = changes[name]
    const currentRequest = currentDependencies[name]
    const currentSource = classifyDependencySource(currentRequest ?? '', {
      workspace: currentLocalDeps[name]?.workspace,
      installed: !!currentLocalDeps[name]?.resolved,
    })
    const nextSource = classifyDependencySource(nextRequest ?? '', {
      workspace: nextLocalDeps[name]?.workspace,
      installed: !!nextLocalDeps[name]?.resolved,
    })
    if (!nextRequest) return true
    if (currentRequest !== nextRequest && (currentSource.local || nextSource.local)) return true
    const { resolved, local } = nextLocalDeps[name] || {}
    if (local || resolved && satisfies(resolved, nextRequest, { includePrerelease: true })) continue
    return true
  }
  return false
}

export function hasDependencyRuntimeChange(input: DependencyRuntimeChange) {
  const {
    name,
    changes,
    previousDependencies,
    previousLocalDeps,
    nextLocalDeps,
  } = input
  const next = nextLocalDeps[name]
  if (!next) return false
  if (next.resolved !== previousLocalDeps[name]?.resolved) return true
  if (previousDependencies[name] === changes[name]) return false
  return classifyDependencySource(changes[name] ?? '', {
    workspace: next.workspace,
    installed: !!next.resolved,
  }).local
}

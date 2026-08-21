import { Dict } from 'koishi'
import { satisfies } from 'semver'
import { classifyDependencySource } from '../shared'
import type { Dependency } from './installer-types'

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

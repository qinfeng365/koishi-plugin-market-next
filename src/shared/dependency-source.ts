export type DependencySource =
  | 'registry'
  | 'workspace'
  | 'file'
  | 'link'
  | 'portal'
  | 'git'
  | 'url'
  | 'unbound'

export interface DependencySourceInfo {
  source: DependencySource
  local: boolean
  bound: boolean
}

export interface DependencySourceOptions {
  workspace?: boolean
  installed?: boolean
  discoveredLocal?: boolean
  registryNotFound?: boolean
}

export interface DependencySourceState {
  request?: string
  resolved?: string
  source?: DependencySource
  local?: boolean
  bound?: boolean
  workspace?: boolean
}

export interface DiscoveredLocalPluginOptions {
  declared?: boolean
  configured?: boolean
  running?: boolean
  workspace?: boolean
}

const LOCAL_PROTOCOLS = ['file', 'link', 'portal', 'workspace'] as const

export function classifyDependencySource(request = '', options: DependencySourceOptions = {}): DependencySourceInfo {
  const value = request.trim()
  const protocol = LOCAL_PROTOCOLS.find(protocol => value.toLowerCase().startsWith(`${protocol}:`))
  if (protocol) {
    return {
      source: protocol,
      local: true,
      bound: true,
    }
  }
  if (isLocalPath(value)) return { source: 'file', local: true, bound: true }
  if (options.workspace) return { source: 'workspace', local: true, bound: true }
  if (/^(?:https?|ftp):/i.test(value)) return { source: 'url', local: false, bound: true }
  if (/^(?:git(?:\+[^:]+)?|github|gitlab|bitbucket):/i.test(value) || /^[\w.-]+\/[\w.-]+(?:#.*)?$/.test(value)) {
    return { source: 'git', local: false, bound: true }
  }
  if (options.installed && (options.discoveredLocal || options.registryNotFound)) {
    return { source: 'unbound', local: true, bound: false }
  }
  return { source: 'registry', local: false, bound: true }
}

export function classifyRegistryNotFoundDependency(
  dependency: DependencySourceState | undefined,
  plugin: boolean,
): DependencySourceInfo | undefined {
  if (!plugin || !dependency?.resolved || dependency.source !== 'registry') return
  return classifyDependencySource(dependency.request, {
    installed: true,
    registryNotFound: true,
  })
}

export function reuseConfirmedDependencySource(
  previous: DependencySourceState | undefined,
  current: DependencySourceState | undefined,
  confirmationFresh: boolean,
): DependencySourceInfo | undefined {
  if (!confirmationFresh || previous?.source !== 'unbound') return
  if (!current?.resolved || previous.request !== current.request || previous.resolved !== current.resolved) return
  return { source: 'unbound', local: true, bound: false }
}

export function findUnboundLocalDependencies(
  dependencies: Record<string, DependencySourceState | undefined>,
  changes: Record<string, string | undefined>,
) {
  return Object.entries(dependencies)
    .filter(([name, dependency]) => {
      if (!dependency || dependency.source !== 'unbound') return false
      return !Object.prototype.hasOwnProperty.call(changes, name)
    })
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b))
}

export function findDependenciesNeedingSourceCheck(
  dependencies: Record<string, DependencySourceState | undefined>,
  changes: Record<string, string | undefined>,
  completedNames: Iterable<string>,
) {
  const completed = new Set(completedNames)
  return Object.entries(dependencies)
    .filter(([name, dependency]) => {
      if (!dependency || isLocalDependency(dependency)) return false
      if (!dependency.resolved || dependency.source !== 'registry') return false
      if (completed.has(name)) return false
      return !Object.prototype.hasOwnProperty.call(changes, name)
    })
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b))
}

export function isLocalDependency(dependency?: DependencySourceState) {
  if (!dependency) return false
  if (dependency.local || dependency.workspace) return true
  return dependency.source === 'workspace'
    || dependency.source === 'file'
    || dependency.source === 'link'
    || dependency.source === 'portal'
    || dependency.source === 'unbound'
}

export function shouldIncludeDiscoveredLocalPlugin(options: DiscoveredLocalPluginOptions) {
  if (options.declared) return false
  return !!(options.configured || options.running || options.workspace)
}

export function allRegistryAttemptsNotFound(reasons: Array<string | undefined>) {
  return reasons.length > 0 && reasons.every(reason => reason === 'not-found')
}

export function getRegistryAttemptReasons(error: unknown, fallback?: string) {
  const reasons = (error as { marketNextReasons?: unknown })?.marketNextReasons
  if (Array.isArray(reasons)) {
    const normalized = reasons.filter((reason): reason is string => typeof reason === 'string' && !!reason)
    if (normalized.length) return normalized
  }
  return fallback ? [fallback] : []
}

export function shouldPenalizeRegistryRoute(reason?: string) {
  return reason !== 'not-found'
}

function isLocalPath(value: string) {
  return /^(?:\.{1,2}[\\/]|[a-z]:[\\/]|[\\/]{1,2})/i.test(value)
}

import { ref } from 'vue'
import { store } from '@koishijs/client'
import { gt, prerelease, valid } from 'semver'

export const active = ref('')

export type FrontendMode = 'performance' | 'polished'
export type LayoutMode = 'grid' | 'list'

export interface UpdateIgnoreRule {
  version?: string
  count?: number
  until?: number
  ignoredAt?: number
}

export type IgnoredUpdates = Record<string, string | UpdateIgnoreRule | undefined>

export interface UpdateIgnoreOptions {
  duration?: number
  count?: number
}

export interface UpdatePolicy {
  updateIgnored?: IgnoredUpdates
  updateIgnoredPackages?: string
  updateIgnoreDuration?: number
  updateIgnoreVersions?: number
  updateIgnorePrerelease?: boolean
}

export function getFrontendMode(config?: { market?: { frontendMode?: FrontendMode } }): FrontendMode {
  const pluginConfig = findMarketNextConfig((store as any).config?.plugins)
  if (pluginConfig?.frontendMode === 'polished') return 'polished'
  if (pluginConfig?.frontendMode === 'performance') return 'performance'
  return config?.market?.frontendMode === 'polished' ? 'polished' : 'performance'
}

export function getDepsLayout(config?: { market?: { depsLayout?: LayoutMode } }): LayoutMode {
  const pluginConfig = findMarketNextConfig((store as any).config?.plugins)
  if (pluginConfig?.depsLayout === 'list') return 'list'
  if (pluginConfig?.depsLayout === 'grid') return 'grid'
  return config?.market?.depsLayout === 'list' ? 'list' : 'grid'
}

export function getMarketLayout(config?: { market?: { marketLayout?: LayoutMode } }): LayoutMode {
  const pluginConfig = findMarketNextConfig((store as any).config?.plugins)
  if (pluginConfig?.marketLayout === 'list') return 'list'
  if (pluginConfig?.marketLayout === 'grid') return 'grid'
  return config?.market?.marketLayout === 'list' ? 'list' : 'grid'
}

export function createUpdateIgnoreRule(name: string, policy?: UpdatePolicy, options: UpdateIgnoreOptions = {}): UpdateIgnoreRule | undefined {
  const version = getLatestVersion(name, policy)
  if (!version) return
  const duration = Math.max(0, options.duration ?? policy?.updateIgnoreDuration ?? 0)
  const count = normalizeIgnoreCount(options.count ?? policy?.updateIgnoreVersions)
  const now = Date.now()
  return {
    version,
    count,
    ignoredAt: now,
    until: duration ? now + duration : undefined,
  }
}

export function getLatestVersion(name: string, policy?: UpdatePolicy) {
  return getUpdateCandidates(name, policy)
    .find(version => !isVersionIgnored(name, version, policy))
}

export function getIgnoredUpdateVersion(name: string, policy?: UpdatePolicy) {
  if (isUpdateCheckDisabled(name, policy)) return
  const latest = getUpdateCandidates(name, policy)[0]
  if (!latest || !isVersionIgnored(name, latest, policy)) return
  return latest
}

export function getUpdateIgnoreText(name: string, policy?: UpdatePolicy) {
  const rule = normalizeIgnoreRule(policy?.updateIgnored?.[name])
  if (!rule?.version) return ''
  const parts = [`已忽略 ${rule.version}`]
  if (rule.count && rule.count > 1) parts.push(`连续 ${rule.count} 个版本`)
  if (rule.until) parts.push(`到 ${new Date(rule.until).toLocaleString()}`)
  return parts.join('，')
}

export function isUpdateIgnored(name: string, policy?: UpdatePolicy) {
  return !!getIgnoredUpdateVersion(name, policy)
}

export function hasUpdate(name: string, policy?: UpdatePolicy) {
  const latest = getLatestVersion(name, policy)
  const local = store.dependencies?.[name]
  if (!latest || local?.workspace) return
  try {
    return gt(latest, local.resolved)
  } catch {}
}

export function isUpdateCheckDisabled(name: string, policy?: UpdatePolicy) {
  const names = parsePackageList(policy?.updateIgnoredPackages)
  return names.has(normalizeName(name))
}

function getUpdateCandidates(name: string, policy?: UpdatePolicy) {
  const versions = Object.keys(store.registry?.[name] ?? {})
  const local = store.dependencies?.[name]
  if (!versions.length || !local?.resolved || local.workspace) return []
  return versions.filter((version) => {
    if (!valid(version)) return false
    if (policy?.updateIgnorePrerelease && prerelease(version)?.length) return false
    try {
      return gt(version, local.resolved)
    } catch {
      return false
    }
  })
}

function isVersionIgnored(name: string, version: string, policy?: UpdatePolicy) {
  if (isUpdateCheckDisabled(name, policy)) return true
  const rule = normalizeIgnoreRule(policy?.updateIgnored?.[name])
  if (!rule?.version) return false
  if (rule.until && Date.now() > rule.until) return false
  if (rule.version === version) return true

  const candidates = getUpdateCandidates(name, policy)
  const ignoredIndex = candidates.indexOf(rule.version)
  const targetIndex = candidates.indexOf(version)
  if (ignoredIndex < 0 || targetIndex < 0) return false
  if (targetIndex > ignoredIndex) return true
  return ignoredIndex - targetIndex < normalizeIgnoreCount(rule.count)
}

function normalizeIgnoreRule(value?: string | UpdateIgnoreRule) {
  if (!value) return
  if (typeof value === 'string') return { version: value, count: 1 } as UpdateIgnoreRule
  return value
}

function normalizeIgnoreCount(value?: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(20, Math.floor(value)))
}

function parsePackageList(value?: string) {
  return new Set((value ?? '')
    .split(/[\s,，;；]+/g)
    .map(normalizeName)
    .filter(Boolean))
}

function normalizeName(name?: string) {
  return (name ?? '').trim().toLowerCase()
}

function findMarketNextConfig(plugins: any): any {
  let fallback: any

  function visit(object: any): any {
    if (!object || typeof object !== 'object') return
    for (const rawKey of Object.keys(object)) {
      if (rawKey.startsWith('$')) continue
      const value = object[rawKey]
      if (!value || typeof value !== 'object') continue
      const disabled = rawKey.startsWith('~')
      const key = disabled ? rawKey.slice(1) : rawKey
      const name = key.split(':', 1)[0]
      if (name === 'market-next' || name === 'koishi-plugin-market-next') {
        if (!disabled) return value
        fallback ||= value
      }
      const nested = visit(value)
      if (nested) return nested
    }
  }

  return visit(plugins) ?? fallback
}

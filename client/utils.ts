import { ref } from 'vue'
import { store } from '@koishijs/client'
import { gt, prerelease, valid } from 'semver'

export const active = ref('')

export interface UpdateIgnoreRule {
  version?: string
  count?: number
  until?: number
  ignoredAt?: number
}

export type IgnoredUpdates = Record<string, string | UpdateIgnoreRule | undefined>

export interface UpdatePolicy {
  updateIgnored?: IgnoredUpdates
  updateIgnoredPackages?: string
  updateIgnoreDuration?: number
  updateIgnoreVersions?: number
  updateIgnorePrerelease?: boolean
}

export function createUpdateIgnoreRule(name: string, policy?: UpdatePolicy): UpdateIgnoreRule | undefined {
  const version = getLatestVersion(name, policy)
  if (!version) return
  const duration = Math.max(0, policy?.updateIgnoreDuration ?? 0)
  const count = normalizeIgnoreCount(policy?.updateIgnoreVersions)
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

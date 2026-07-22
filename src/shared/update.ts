import { compare, gt, prerelease, valid } from 'semver'

export interface UpdateIgnoreRule {
  version?: string
  count?: number
  until?: number
  ignoredAt?: number
}

export type IgnoredUpdates = Record<string, string | UpdateIgnoreRule | undefined>

export interface UpdateIgnorePolicy {
  updateIgnored?: IgnoredUpdates
  updateIgnoredPackages?: string
  updateIgnoreVersions?: number
  updateIgnorePrerelease?: boolean
}

export function normalizeUpdateIgnoreRule(value?: string | UpdateIgnoreRule) {
  if (!value) return
  if (typeof value === 'string') return { version: value, count: 1 } as UpdateIgnoreRule
  return value
}

export function normalizeUpdateIgnoreCount(value?: number) {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(20, Math.floor(value)))
}

export function parseUpdateIgnoredPackages(value?: string) {
  return new Set((value ?? '')
    .split(/[\s,，;；]+/g)
    .map(normalizeUpdatePackageName)
    .filter(Boolean))
}

export function isUpdateCheckDisabled(name: string, policy?: UpdateIgnorePolicy) {
  return parseUpdateIgnoredPackages(policy?.updateIgnoredPackages).has(normalizeUpdatePackageName(name))
}

export function getUpdateCandidates(
  versions: Iterable<string>,
  resolved?: string,
  policy?: UpdateIgnorePolicy,
) {
  if (!resolved || !valid(resolved)) return []
  const result = Array.from(new Set(versions)).filter((version) => {
    if (!valid(version)) return false
    if (policy?.updateIgnorePrerelease && prerelease(version)?.length) return false
    try {
      return gt(version, resolved)
    } catch {
      return false
    }
  })
  return result.sort((a, b) => compare(b, a))
}

export function isUpdateVersionIgnored(
  name: string,
  version: string,
  candidates: string[],
  policy?: UpdateIgnorePolicy,
  now = Date.now(),
) {
  if (isUpdateCheckDisabled(name, policy)) return true
  const rule = normalizeUpdateIgnoreRule(policy?.updateIgnored?.[name])
  if (!rule?.version) return false
  if (rule.until && now > rule.until) return false
  if (rule.version === version) return true

  const ignoredIndex = candidates.indexOf(rule.version)
  const targetIndex = candidates.indexOf(version)
  if (ignoredIndex < 0 || targetIndex < 0) return false
  if (targetIndex > ignoredIndex) return true
  return ignoredIndex - targetIndex < normalizeUpdateIgnoreCount(rule.count)
}

export function getLatestAllowedUpdate(
  name: string,
  versions: Iterable<string>,
  resolved?: string,
  policy?: UpdateIgnorePolicy,
  now = Date.now(),
) {
  const candidates = getUpdateCandidates(versions, resolved, policy)
  return candidates.find((version) => !isUpdateVersionIgnored(name, version, candidates, policy, now))
}

function normalizeUpdatePackageName(name?: string) {
  return (name ?? '').trim().toLowerCase()
}

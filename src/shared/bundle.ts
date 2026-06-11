import type { Dict } from 'koishi'
import { validRange } from 'semver'

export interface PluginBundleMember {
  package: string
  plugin: string
  version: string
  required?: boolean
  config?: Dict
}

export interface PluginBundleManifest {
  label?: string
  description?: string
  members: PluginBundleMember[]
}

export interface PluginBundleValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface PluginBundleRecordMember extends PluginBundleMember {
  selected: boolean
  installedByBundle?: boolean
  configured?: boolean
  moved?: boolean
  skipped?: boolean
  usePreset?: boolean
}

export interface PluginBundleRecord {
  package: string
  version: string
  label?: string
  groupKey?: string
  installedAt: number
  members: PluginBundleRecordMember[]
}

export interface BundleInstallMember extends PluginBundleMember {
  selected: boolean
  createConfig: boolean
  usePreset: boolean
  conflict?: 'same-group' | 'other-config' | 'package-mismatch'
  move?: boolean
}

export interface BundleInstallRequest {
  package: string
  version: string
  bundle: PluginBundleManifest
  members: BundleInstallMember[]
}

export interface BundleInstallResult {
  code: number
  installed: string[]
  configured: string[]
  moved: string[]
  skipped: string[]
  groupKey?: string
  record?: PluginBundleRecord
}

export interface BundleConfigRemoveRequest {
  package: string
  members?: Pick<PluginBundleMember, 'package' | 'plugin'>[]
  removeEmptyGroup?: boolean
}

export interface BundleConfigRemoveResult {
  groupKey?: string
  removed: string[]
  removedGroup?: boolean
}

export const BUNDLE_KEYWORD = 'market:package'
export const BUNDLE_PACKAGE_RE = /^(?:@[0-9a-z-]+\/)?koishi-plugin-pa-[0-9a-z-]+$/
export const PLUGIN_PACKAGE_RE = /^(?:@[^/]+\/)?koishi-plugin-[0-9a-z-]+$|^@koishijs\/plugin-[0-9a-z-]+$/
const SENSITIVE_RE = /(command|script|exec|shell|path|file|token|secret|password|sql|url|webhook|endpoint)/i

export function isBundlePackageName(name = '') {
  return name === name.toLowerCase() && BUNDLE_PACKAGE_RE.test(name)
}

export function hasBundleKeyword(keywords?: string[]) {
  return !!keywords?.some(keyword => keyword.toLowerCase() === BUNDLE_KEYWORD)
}

export function isBundleLike(meta: { name?: string, keywords?: string[], koishi?: any }) {
  return isBundlePackageName(meta.name) || hasBundleKeyword(meta.keywords) || !!parseBundleManifest(meta.koishi?.bundle)
}

export function parseBundleManifest(value: any): PluginBundleManifest | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const members = Array.isArray(value.members)
    ? value.members.map(parseBundleMember).filter(Boolean) as PluginBundleMember[]
    : []
  return {
    label: typeof value.label === 'string' ? value.label : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    members,
  }
}

function parseBundleMember(value: any): PluginBundleMember | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  return {
    package: typeof value.package === 'string' ? value.package : '',
    plugin: typeof value.plugin === 'string' ? value.plugin : '',
    version: typeof value.version === 'string' ? value.version : '',
    required: value.required === true,
    config: value.config && typeof value.config === 'object' && !Array.isArray(value.config) ? value.config : undefined,
  }
}

export function validateBundleManifest(packageName: string, bundle?: PluginBundleManifest, options: { keyword?: boolean } = {}): PluginBundleValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const normalizedName = packageName.toLowerCase()
  if (packageName !== normalizedName) errors.push('package name must be lowercase')
  if (isBundlePackageName(packageName) || options.keyword || bundle) {
    if (!isBundlePackageName(packageName)) errors.push('bundle package name must be koishi-plugin-pa-* or @scope/koishi-plugin-pa-*')
  }
  if (!bundle) {
    errors.push('missing koishi.bundle')
    return { valid: false, errors, warnings }
  }
  if (!bundle.members.length) errors.push('koishi.bundle.members must not be empty')
  if (!options.keyword) warnings.push(`missing keyword "${BUNDLE_KEYWORD}"`)

  const seen = new Set<string>()
  const seenPackages = new Set<string>()
  const seenPlugins = new Set<string>()
  for (const [index, member] of bundle.members.entries()) {
    const prefix = `members[${index}]`
    const normalizedPackage = member.package.toLowerCase()
    if (!member.package) errors.push(`${prefix}.package is required`)
    else if (member.package !== normalizedPackage) errors.push(`${prefix}.package must be lowercase`)
    else if (!PLUGIN_PACKAGE_RE.test(member.package)) errors.push(`${prefix}.package is not a valid Koishi plugin package name`)
    else if (normalizedPackage === packageName.toLowerCase()) errors.push(`${prefix}.package must not reference the bundle package itself`)

    if (!member.plugin) errors.push(`${prefix}.plugin is required`)
    else if (!/^(?:@[^/]+\/)?[0-9a-z][0-9a-z-]*(?:\/[0-9a-z][0-9a-z-]*)?$/.test(member.plugin)) {
      warnings.push(`${prefix}.plugin should use lowercase package-like keys to avoid config conflicts`)
    }

    if (!member.version) errors.push(`${prefix}.version is required`)
    else if (!validRange(member.version.trim())) errors.push(`${prefix}.version is not a valid semver range`)

    const key = `${member.package}\n${member.plugin}`
    if (seen.has(key)) errors.push(`${prefix} duplicates another member`)
    seen.add(key)
    if (member.package) {
      if (seenPackages.has(normalizedPackage)) warnings.push(`${prefix}.package is listed more than once`)
      seenPackages.add(normalizedPackage)
    }
    if (member.plugin) {
      const normalizedPlugin = member.plugin.toLowerCase()
      if (seenPlugins.has(normalizedPlugin)) warnings.push(`${prefix}.plugin may conflict with another member`)
      seenPlugins.add(normalizedPlugin)
    }
  }

  return { valid: !errors.length, errors, warnings }
}

export function getPluginShortname(name: string) {
  return name.replace(/(koishi-|^@koishijs\/)plugin-/, '')
}

export function normalizeBundleIdent(value: string) {
  return value.toLowerCase()
    .replace(/^@/, '')
    .replace(/[^0-9a-z]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'bundle'
}

export function getBundleGroupIdent(packageName: string) {
  return `pa-${normalizeBundleIdent(getPluginShortname(packageName))}`
}

export function getBundleMemberIdent(packageName: string, member: Pick<PluginBundleMember, 'package' | 'plugin'>) {
  return `pa-${normalizeBundleIdent(getPluginShortname(packageName))}-${normalizeBundleIdent(getPluginShortname(member.plugin || member.package))}`
}

export function scanSensitiveConfig(value: unknown, path = ''): string[] {
  const result: string[] = []
  if (!value || typeof value !== 'object') return result
  for (const [key, child] of Object.entries(value as Dict)) {
    const next = path ? `${path}.${key}` : key
    if (SENSITIVE_RE.test(key)) result.push(next)
    result.push(...scanSensitiveConfig(child, next))
  }
  return result
}

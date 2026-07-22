import { reactive, ref } from 'vue'
import { send, store } from '@koishijs/client'
import { gt } from 'semver'
import { translate } from './i18n'
import {
  getUpdateCandidates as getSharedUpdateCandidates,
  isUpdateCheckDisabled as isSharedUpdateCheckDisabled,
  isUpdateVersionIgnored,
  normalizeUpdateIgnoreCount,
  normalizeUpdateIgnoreRule,
  type IgnoredUpdates,
  type UpdateIgnoreRule,
} from '../src/shared/update'

export type { IgnoredUpdates, UpdateIgnoreRule } from '../src/shared/update'

export const active = ref('')

export type FrontendMode = 'performance' | 'polished'
export type LayoutMode = 'grid' | 'list'

export interface MarketNextConfigPatch extends UpdatePolicy {
  frontendMode?: FrontendMode
  depsLayout?: LayoutMode
  marketSilentStatusRules?: MarketSilentStatusRule[]
  marketSilentDateRules?: MarketSilentDateRule[]
  marketSilentRecentRules?: MarketSilentRecentRule[]
  marketSilentCustomRules?: MarketSilentCustomRule[]
  marketSilentRules?: MarketSilentRule[]
  marketSilentFilters?: string
  idleProbe?: boolean
  idleProbeDelay?: number
  idleProbeBootDelay?: number
  idleProbeInterval?: number
  bulkMode?: boolean
  removeConfig?: boolean
  bundleRecords?: Record<string, any>
}

export interface MarketSilentStatusRule {
  target?: 'preview' | 'insecure' | 'bundle'
  note?: string
  enabled?: boolean
}

export interface MarketSilentDateRule {
  field?: 'created' | 'updated'
  relation?: 'before' | 'after'
  date?: string
  note?: string
  enabled?: boolean
}

export interface MarketSilentRecentRule {
  field?: 'created' | 'updated'
  days?: number
  note?: string
  enabled?: boolean
}

export interface MarketSilentCustomRule {
  query?: string
  note?: string
  enabled?: boolean
}

export interface MarketSilentRule {
  type?: 'custom' | 'preview' | 'insecure' | 'bundle' | 'created-before' | 'created-after' | 'updated-before' | 'updated-after' | 'created-within' | 'updated-within'
  value?: string
  date?: string
  days?: number
  query?: string
  note?: string
  enabled?: boolean
}

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

export interface MarketNextDataStore {
  override?: Record<string, string>
  updateIgnored?: IgnoredUpdates
  bundleRecords?: Record<string, any>
  collapsedGroups?: Record<string, boolean>
}

const fallbackMarketData = reactive<MarketNextDataStore>({
  override: {},
  updateIgnored: {},
  bundleRecords: {},
  collapsedGroups: {},
})

function getMarketDataStore(): MarketNextDataStore {
  return ((store as any).marketData ||= fallbackMarketData)
}

export function getPendingOverrides() {
  const data = getMarketDataStore()
  data.override ||= {}
  return data.override
}

export function getCollapsedGroups() {
  const data = getMarketDataStore()
  data.collapsedGroups ||= {}
  return data.collapsedGroups
}

export function normalizeFrontendMode(value: unknown): FrontendMode | undefined {
  return value === 'polished' || value === 'performance' ? value : undefined
}

export function getFrontendMode(config?: { market?: { frontendMode?: FrontendMode } }): FrontendMode {
  const pluginConfig = getMarketNextConfig()
  if (pluginConfig) return normalizeFrontendMode(pluginConfig.frontendMode) ?? 'performance'
  return 'performance'
}

export function getDepsLayout(config?: { market?: { depsLayout?: LayoutMode } }): LayoutMode {
  const pluginConfig = getMarketNextConfig()
  if (pluginConfig) return pluginConfig.depsLayout === 'list' ? 'list' : 'grid'
  return 'grid'
}

interface SilentConfig {
  market?: {
    marketSilentStatusRules?: MarketSilentStatusRule[]
    marketSilentDateRules?: MarketSilentDateRule[]
    marketSilentRecentRules?: MarketSilentRecentRule[]
    marketSilentCustomRules?: MarketSilentCustomRule[]
    marketSilentRules?: MarketSilentRule[]
    marketSilentFilters?: string
  }
}

export function getMarketSilentFilters(config?: SilentConfig) {
  const pluginConfig = getMarketNextConfig()
  if (hasOwn(pluginConfig, 'marketSilentRules')) {
    return rulesToSilentFilters(Array.isArray(pluginConfig.marketSilentRules) ? pluginConfig.marketSilentRules : []).join('\n')
  }
  if (hasNewSilentRuleConfig(pluginConfig)) {
    return structuredSilentRulesToFilters(pluginConfig).join('\n')
  }
  if (hasOwn(pluginConfig, 'marketSilentFilters')) {
    return String(pluginConfig.marketSilentFilters ?? '')
  }
  return ''
}

export function getMarketSilentRules(config?: SilentConfig) {
  const pluginConfig = getMarketNextConfig()
  if (hasOwn(pluginConfig, 'marketSilentRules')) return rulesToSilentFilters(Array.isArray(pluginConfig.marketSilentRules) ? pluginConfig.marketSilentRules : [])
  if (hasNewSilentRuleConfig(pluginConfig)) return structuredSilentRulesToFilters(pluginConfig)
  return []
}

function hasNewSilentRuleConfig(config?: Record<string, any>) {
  return hasConfiguredSilentRules(config?.marketSilentStatusRules)
    || hasConfiguredSilentRules(config?.marketSilentDateRules)
    || hasConfiguredSilentRules(config?.marketSilentRecentRules)
    || hasConfiguredSilentRules(config?.marketSilentCustomRules)
}

function hasConfiguredSilentRules(value: unknown) {
  return Array.isArray(value) && value.length > 0
}

function structuredSilentRulesToFilters(config?: SilentConfig['market']) {
  return [
    ...statusRulesToFilters(config?.marketSilentStatusRules ?? []),
    ...dateRulesToFilters(config?.marketSilentDateRules ?? []),
    ...recentRulesToFilters(config?.marketSilentRecentRules ?? []),
    ...customRulesToFilters(config?.marketSilentCustomRules ?? []),
  ]
}

function statusRulesToFilters(rules: MarketSilentStatusRule[]) {
  return rules
    .filter(rule => rule?.enabled !== false && rule.target)
    .map(rule => `is:${rule.target}`)
}

function dateRulesToFilters(rules: MarketSilentDateRule[]) {
  return rules
    .filter(rule => rule?.enabled !== false && rule.field && rule.relation && isDateString(rule.date))
    .map((rule) => `${rule.field}:${rule.relation === 'before' ? '<' : '>'}${rule.date}`)
}

function recentRulesToFilters(rules: MarketSilentRecentRule[]) {
  return rules
    .filter(rule => rule?.enabled !== false && rule.field && Number.isFinite(rule.days) && rule.days! > 0)
    .map(rule => `${rule.field}:within:${Math.floor(rule.days!)}`)
}

function customRulesToFilters(rules: MarketSilentCustomRule[]) {
  return rules
    .filter(rule => rule?.enabled !== false)
    .map(rule => String(rule.query ?? '').trim())
    .filter(Boolean)
}

function isDateString(value?: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '')
}

export function rulesToSilentFilters(rules: MarketSilentRule[]) {
  return rules
    .filter(rule => rule?.enabled !== false)
    .map(rule => ruleToSilentFilter(rule))
    .filter(Boolean)
}

export function ruleToSilentFilter(rule: MarketSilentRule) {
  const value = String(rule.value ?? '').trim()
  const date = String(rule.date ?? value).trim()
  const days = rule.days == null ? value : String(rule.days)
  const query = String(rule.query ?? value).trim()
  switch (rule.type) {
    case 'preview': return 'is:preview'
    case 'insecure': return 'is:insecure'
    case 'bundle': return 'is:bundle'
    case 'created-before': return isDateString(date) ? `created:<${date}` : ''
    case 'created-after': return isDateString(date) ? `created:>${date}` : ''
    case 'updated-before': return isDateString(date) ? `updated:<${date}` : ''
    case 'updated-after': return isDateString(date) ? `updated:>${date}` : ''
    case 'created-within': return isPositiveInteger(days) ? `created:within:${Math.floor(Number(days))}` : ''
    case 'updated-within': return isPositiveInteger(days) ? `updated:within:${Math.floor(Number(days))}` : ''
    case 'custom':
    default:
      return query
  }
}

function isPositiveInteger(value?: string) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 && Math.floor(number) === number
}

export function getMarketNextConfig(): any {
  return findMarketNextConfig((store as any).config?.plugins)
}

export function getMarketNextPolicy(fallback?: { market?: UpdatePolicy }): UpdatePolicy {
  const pluginConfig = getMarketNextConfig()
  const data = getMarketDataStore()
  return {
    ...pickExisting(pluginConfig, [
      'updateIgnoredPackages',
      'updateIgnoreDuration',
      'updateIgnoreVersions',
      'updateIgnorePrerelease',
    ] satisfies Array<keyof UpdatePolicy>),
    updateIgnored: data.updateIgnored ?? {},
  }
}

export function getWritableMarketNextPolicy(fallback?: { market?: UpdatePolicy }): UpdatePolicy {
  const pluginConfig = getMarketNextConfig()
  const data = getMarketDataStore()
  data.updateIgnored ||= {}
  if (!pluginConfig) return { updateIgnored: data.updateIgnored }
  pluginConfig.updateIgnored = data.updateIgnored
  return pluginConfig
}

export function getBulkMode(fallback?: { market?: { bulkMode?: boolean } }) {
  const pluginConfig = getMarketNextConfig()
  if (hasOwn(pluginConfig, 'bulkMode')) {
    return !!pluginConfig.bulkMode
  }
  return false
}

export function getRemoveConfig(fallback?: { market?: { removeConfig?: boolean } }) {
  const pluginConfig = getMarketNextConfig()
  if (hasOwn(pluginConfig, 'removeConfig')) {
    return pluginConfig.removeConfig
  }
  return undefined
}

export function getBundleRecords(fallback?: { market?: { bundleRecords?: Record<string, any> } }) {
  return getMarketDataStore().bundleRecords ?? {}
}

export function getWritableBundleRecords(fallback?: { market?: { bundleRecords?: Record<string, any> } }) {
  const data = getMarketDataStore()
  data.bundleRecords ||= {}
  return data.bundleRecords
}

export function patchMarketNextConfig(patch: Partial<MarketNextConfigPatch>) {
  const pluginConfig = getMarketNextConfig()
  if (pluginConfig) Object.assign(pluginConfig, patch)
  const task = send('market/update-config', patch)
  if (!task) return Promise.resolve(false)
  return task.catch((error) => {
    console.error(error)
    return false
  })
}

export function patchMarketNextData(patch: Partial<MarketNextDataStore>) {
  const data = getMarketDataStore()
  Object.assign(data, patch)
  const task = send('market/update-data', patch)
  if (!task) return Promise.resolve(false)
  return task.then((next: MarketNextDataStore) => {
    Object.assign(data, next)
    return true
  }).catch((error) => {
    console.error(error)
    return false
  })
}

export function createUpdateIgnoreRule(name: string, policy?: UpdatePolicy, options: UpdateIgnoreOptions = {}): UpdateIgnoreRule | undefined {
  const version = getLatestVersion(name, policy)
  if (!version) return
  const duration = Math.max(0, options.duration ?? policy?.updateIgnoreDuration ?? 0)
  const count = normalizeUpdateIgnoreCount(options.count ?? policy?.updateIgnoreVersions)
  const now = Date.now()
  return {
    version,
    count,
    ignoredAt: now,
    until: duration ? now + duration : undefined,
  }
}

export function getLatestVersion(name: string, policy?: UpdatePolicy) {
  const candidates = getUpdateCandidates(name, policy)
  return candidates.find(version => !isUpdateVersionIgnored(name, version, candidates, policy))
}

export function getIgnoredUpdateVersion(name: string, policy?: UpdatePolicy) {
  if (isUpdateCheckDisabled(name, policy)) return
  const latest = getUpdateCandidates(name, policy)[0]
  if (!latest || !isVersionIgnored(name, latest, policy)) return
  return latest
}

export function getUpdateIgnoreText(name: string, policy?: UpdatePolicy) {
  const rule = normalizeUpdateIgnoreRule(policy?.updateIgnored?.[name])
  if (!rule?.version) return ''
  const parts = [translate('common.ignore.version', { version: rule.version })]
  if (rule.count && rule.count > 1) parts.push(translate('common.ignore.count', { count: rule.count }))
  if (rule.until) parts.push(translate('common.ignore.until', { time: new Date(rule.until).toLocaleString() }))
  return parts.join(translate('common.ignore.separator'))
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
  return isSharedUpdateCheckDisabled(name, policy)
}

function getUpdateCandidates(name: string, policy?: UpdatePolicy) {
  const local = store.dependencies?.[name]
  if (local?.workspace) return []
  return getSharedUpdateCandidates(Object.keys(store.registry?.[name] ?? {}), local?.resolved, policy)
}

function isVersionIgnored(name: string, version: string, policy?: UpdatePolicy) {
  const candidates = getUpdateCandidates(name, policy)
  return isUpdateVersionIgnored(name, version, candidates, policy)
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
      if (name !== 'group') continue
      const nested = visit(value)
      if (nested) return nested
    }
  }

  return visit(plugins) ?? fallback
}

function pickExisting<T extends object, K extends keyof T>(source: T, keys: K[]): Partial<Pick<T, K>> {
  const result: Partial<Pick<T, K>> = {}
  for (const key of keys) {
    if (hasOwn(source, key)) {
      result[key] = source[key]
    }
  }
  return result
}

function hasOwn<T extends object, K extends PropertyKey>(source: T | undefined, key: K): source is T & Record<K, unknown> {
  return !!source && Object.prototype.hasOwnProperty.call(source, key)
}

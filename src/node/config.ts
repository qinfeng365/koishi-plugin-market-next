import { Context, Dict, Schema, Time } from 'koishi'
import Installer from './installer'
import MarketProvider from './market'
import { logLevels, type LogLevel } from './market-internals'
import { getConfigKeyName, type PluginBundleRecord } from '../shared/bundle'

export interface Config {
  logLevel?: LogLevel
  registry?: Installer.Config
  search?: MarketProvider.Config
  chatlunaTool?: boolean
  frontendMode?: 'performance' | 'polished'
  depsLayout?: 'grid' | 'list'
  marketSilentStatusRules?: MarketSilentStatusRule[]
  marketSilentDateRules?: MarketSilentDateRule[]
  marketSilentRecentRules?: MarketSilentRecentRule[]
  marketSilentCustomRules?: MarketSilentCustomRule[]
  marketSilentRules?: MarketSilentRule[]
  marketSilentFilters?: string
  idleProbe?: boolean
  idleProbeDelayMinutes?: number
  idleProbeBootDelayMinutes?: number
  idleProbeIntervalHours?: number
  bulkMode?: boolean
  removeConfig?: boolean
  updateIgnoredPackages?: string
  updateIgnoreDays?: number
  updateIgnoreVersions?: number
  updateIgnorePrerelease?: boolean
  collapsedGroups?: Dict<boolean>
  updateIgnored?: Dict<any>
  bundleRecords?: Dict<PluginBundleRecord>
}

interface MarketSilentStatusRule {
  target?: 'preview' | 'insecure' | 'bundle'
  note?: string
  enabled?: boolean
}

interface MarketSilentDateRule {
  field?: 'created' | 'updated'
  relation?: 'before' | 'after'
  date?: string
  note?: string
  enabled?: boolean
}

interface MarketSilentRecentRule {
  field?: 'created' | 'updated'
  days?: number
  note?: string
  enabled?: boolean
}

interface MarketSilentCustomRule {
  query?: string
  note?: string
  enabled?: boolean
}

interface MarketSilentRule {
  type?: 'custom' | 'preview' | 'insecure' | 'bundle' | 'created-before' | 'created-after' | 'updated-before' | 'updated-after' | 'created-within' | 'updated-within'
  value?: string
  date?: string
  days?: number
  query?: string
  note?: string
  enabled?: boolean
}

const MarketSilentRules = Schema.array(Schema.object({
  type: Schema.union([
    Schema.const('preview'),
    Schema.const('insecure'),
    Schema.const('bundle'),
    Schema.const('created-before'),
    Schema.const('created-after'),
    Schema.const('updated-before'),
    Schema.const('updated-after'),
    Schema.const('created-within'),
    Schema.const('updated-within'),
    Schema.const('custom'),
  ]).default('preview'),
  value: Schema.string().default(''),
  note: Schema.string().default(''),
  enabled: Schema.boolean().default(true),
})).role('table').default([])

// Each object below is one section of the config page; the section titles live in the locale files.
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    frontendMode: Schema.union([
      Schema.const('performance'),
      Schema.const('polished'),
    ]).role('radio').default('performance'),
    depsLayout: Schema.union([
      Schema.const('grid'),
      Schema.const('list'),
    ]).role('radio').default('grid'),
  }),
  Schema.intersect([
    Schema.object({
      idleProbe: Schema.boolean().default(true),
    }),
    Schema.union([
      Schema.object({
        idleProbe: Schema.const(false).required(),
      }),
      Schema.object({
        idleProbeDelayMinutes: Schema.number().min(0).default(5),
        idleProbeBootDelayMinutes: Schema.number().min(0).default(1),
        idleProbeIntervalHours: Schema.number().min(0).default(6),
      }),
    ]),
  ]),
  Schema.object({
    registry: Installer.Config,
  }),
  Schema.object({
    search: MarketProvider.Config,
  }),
  Schema.object({
    marketSilentRules: MarketSilentRules,
  }),
  Schema.object({
    chatlunaTool: Schema.boolean().default(false),
    logLevel: Schema.union(logLevels.map(level => Schema.const(level))).default('warn'),
  }),
  // Written by the console pages rather than edited here.
  Schema.object({
    bulkMode: Schema.boolean().hidden(),
    removeConfig: Schema.union([
      Schema.const(undefined),
      Schema.const(true),
      Schema.const(false),
    ]).hidden(),
    updateIgnoredPackages: Schema.string().role('textarea').hidden(),
    updateIgnoreDays: Schema.number().min(0).default(0).hidden(),
    updateIgnoreVersions: Schema.number().min(1).max(20).step(1).default(1).hidden(),
    updateIgnorePrerelease: Schema.boolean().default(false).hidden(),
    collapsedGroups: Schema.dict(Boolean).hidden(),
    marketSilentFilters: Schema.string().role('textarea').hidden(),
    marketSilentStatusRules: Schema.array(Schema.any()).hidden(),
    marketSilentDateRules: Schema.array(Schema.any()).hidden(),
    marketSilentRecentRules: Schema.array(Schema.any()).hidden(),
    marketSilentCustomRules: Schema.array(Schema.any()).hidden(),
  }),
]).i18n({
  'zh-CN': require('./locales/schema.zh-CN'),
  'en-US': require('./locales/schema.en-US'),
})

const configPatchKeys: Array<keyof Config> = [
  'logLevel',
  'frontendMode',
  'depsLayout',
  'marketSilentStatusRules',
  'marketSilentDateRules',
  'marketSilentRecentRules',
  'marketSilentCustomRules',
  'marketSilentRules',
  'marketSilentFilters',
  'idleProbe',
  'idleProbeDelayMinutes',
  'idleProbeBootDelayMinutes',
  'idleProbeIntervalHours',
  'removeConfig',
  'updateIgnoredPackages',
  'updateIgnoreDays',
  'updateIgnoreVersions',
  'updateIgnorePrerelease',
]

const configReloadKeys = new Set<keyof Config>([
  'logLevel',
  'idleProbe',
  'idleProbeDelayMinutes',
  'idleProbeBootDelayMinutes',
  'idleProbeIntervalHours',
])

interface LegacyTimeOption {
  path: '' | 'registry' | 'search'
  from: string
  to: string
  /** How many old units make one new unit. */
  unit: number
  /** Smallest allowed value for anything above 0. */
  min?: number
  /** Largest allowed value; also rounds to a whole number, matching a step(1) schema. */
  max?: number
  /** What a legacy 0 becomes; undefined falls back to the schema default. */
  zero?: number
}

// Time options used to be stored in milliseconds (or hours). They are now stored in
// the unit shown on the config page, and old keys are converted once on startup.
const legacyTimeOptions: LegacyTimeOption[] = [
  { path: '', from: 'idleProbeDelay', to: 'idleProbeDelayMinutes', unit: Time.minute, zero: 0 },
  { path: '', from: 'idleProbeBootDelay', to: 'idleProbeBootDelayMinutes', unit: Time.minute, zero: 0 },
  { path: '', from: 'idleProbeInterval', to: 'idleProbeIntervalHours', unit: Time.hour, zero: 0 },
  { path: '', from: 'updateIgnoreDuration', to: 'updateIgnoreDays', unit: Time.day, zero: 0 },
  // A timeout of 0 means no limit, so it has to stay 0 rather than be rounded up.
  { path: 'registry', from: 'timeout', to: 'timeoutSeconds', unit: Time.second, min: 1, zero: 0 },
  { path: 'search', from: 'timeout', to: 'timeoutSeconds', unit: Time.second, min: 1, zero: 0 },
  { path: 'registry', from: 'installLogRetentionHours', to: 'installLogRetentionDays', unit: Time.day / Time.hour, min: 1, max: 365 },
  { path: 'registry', from: 'installLogRetention', to: 'installLogRetentionDays', unit: Time.day, min: 1, max: 365 },
]

function findMarketNextConfigNode(plugins: any, currentConfig: Config): { parent: any, key: string, value: any } | undefined {
  let best: { parent: any, key: string, value: any, priority: number } | undefined
  const visit = (nodes: any, parentDisabled = false) => {
    for (const key of Object.keys(nodes || {})) {
      if (key.startsWith('$')) continue
      const value = nodes[key]
      if (!value || typeof value !== 'object') continue
      const disabled = parentDisabled || key.startsWith('~')
      const name = getConfigKeyName(key)
      const named = name === 'market-next' || name === 'koishi-plugin-market-next'
      if (value === currentConfig || named) {
        const priority = (disabled ? 0 : 2) + (value === currentConfig ? 2 : 1)
        if (!best || priority > best.priority) best = { parent: nodes, key, value, priority }
      }
      if (name === 'group') visit(value, disabled)
    }
  }
  visit(plugins)
  return best
}

export function ensureMarketNextConfigDefaults(ctx: Context, currentConfig: Config) {
  const target = findMarketNextConfigNode(ctx.loader.config?.plugins, currentConfig)
  if (!target) return false
  let changed = false
  if (target.value.frontendMode !== 'performance' && target.value.frontendMode !== 'polished') {
    target.value.frontendMode = 'performance'
    changed = true
  }
  if (target.value.depsLayout !== 'grid' && target.value.depsLayout !== 'list') {
    target.value.depsLayout = 'grid'
    changed = true
  }
  if (Object.prototype.hasOwnProperty.call(target.value, 'marketLayout')) {
    delete target.value.marketLayout
    changed = true
  }
  for (const { path, from, to, unit, min = 0, max, zero } of legacyTimeOptions) {
    const raw = path ? target.value[path] : target.value
    if (typeof raw?.[from] !== 'number') continue
    const value = Number((raw[from] / unit).toFixed(4))
    const clamped = max ? Math.min(max, Math.max(min, Math.round(value))) : Math.max(min, value)
    raw[to] ??= value > 0 ? clamped : zero
    if (raw[to] === undefined) delete raw[to]
    delete raw[from]
    // The running config was parsed before the conversion, so it only has the defaults.
    const current = path ? currentConfig[path] ??= {} : currentConfig
    if (raw[to] !== undefined) current[to] = raw[to]
    changed = true
  }
  // search.logLevel was an older, narrower copy of the top-level log level.
  const search = target.value.search
  if (search && Object.prototype.hasOwnProperty.call(search, 'logLevel')) {
    if (logLevels.includes(search.logLevel)) target.value.logLevel ??= search.logLevel
    if (target.value.logLevel) currentConfig.logLevel = target.value.logLevel
    delete search.logLevel
    changed = true
  }
  return changed
}

// These now live in data/market-next.json and are removed from koishi.yml once migrated.
export function removeMigratedConfigKeys(ctx: Context, currentConfig: Config) {
  const target = findMarketNextConfigNode(ctx.loader.config?.plugins, currentConfig)
  if (!target) return false
  let changed = false
  for (const key of ['collapsedGroups', 'bulkMode'] as const) {
    // The running config keeps its parsed copy, which a later migration would read again.
    delete currentConfig[key]
    if (!Object.prototype.hasOwnProperty.call(target.value, key)) continue
    delete target.value[key]
    changed = true
  }
  return changed
}

export async function updateMarketNextConfig(ctx: Context, currentConfig: Config, patch: Partial<Config>) {
  const target = findMarketNextConfigNode(ctx.loader.config?.plugins, currentConfig)
  if (!target) return false
  const changedKeys: Array<keyof Config> = []
  let accepted = false
  for (const key of configPatchKeys) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
    accepted = true
    const value = key === 'marketSilentRules'
      ? normalizeMarketSilentRules(patch[key])
      : patch[key] as never
    if (target.value[key] === value) continue
    target.value[key] = value
    changedKeys.push(key)
  }
  if (!accepted) return false
  if (!changedKeys.length) return true
  await ctx.loader.writeConfig(true)
  const requiresReload = changedKeys.some(key => configReloadKeys.has(key))
  if (requiresReload) {
    const parent = findPluginParentContext(ctx.loader.entry, target.parent)
    if (parent && !target.key.startsWith('~')) {
      await ctx.loader.reload(parent, target.key, target.value)
    }
  }
  await ctx.get('console')?.refresh('config')
  if (requiresReload) await ctx.get('console')?.refresh('entry')
  return true
}

function normalizeMarketSilentRules(value: unknown): MarketSilentRule[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((rule): rule is MarketSilentRule => !!rule && typeof rule === 'object')
    .map((rule) => {
      const normalized: MarketSilentRule = {
        type: rule.type,
        value: normalizeMarketSilentRuleValue(rule),
        note: rule.note,
        enabled: rule.enabled,
      }
      if (normalized.enabled == null) normalized.enabled = true
      return normalized
    })
}

function normalizeMarketSilentRuleValue(rule: MarketSilentRule) {
  const value = String(rule.value ?? '').trim()
  if (value) return value
  if (rule.date) return String(rule.date).trim()
  if (rule.days != null) return String(rule.days).trim()
  if (rule.query) return String(rule.query).trim()
  return ''
}

function findPluginParentContext(ctx: Context | undefined, plugins: any): Context | undefined {
  if (!ctx) return
  if (ctx.scope.config === plugins) return ctx
  const record = ctx.scope[Symbol.for('koishi.loader.record')] as Record<string, any> | undefined
  for (const fork of Object.values(record ?? {})) {
    const found = findPluginParentContext(fork.ctx, plugins)
    if (found) return found
  }
}

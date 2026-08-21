import { Context, Dict, Schema, Time } from 'koishi'
import Installer from './installer'
import MarketProvider from './market'
import type { PluginBundleRecord } from '../shared/bundle'

export interface Config {
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
  idleProbeDelay?: number
  idleProbeBootDelay?: number
  idleProbeInterval?: number
  bulkMode?: boolean
  removeConfig?: boolean
  updateIgnoredPackages?: string
  updateIgnoreDuration?: number
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

const MarketSilentRuleType = Schema.union([
  Schema.const('preview').description('状态：预览版插件'),
  Schema.const('insecure').description('状态：不安全插件'),
  Schema.const('bundle').description('状态：插件包'),
  Schema.const('created-before').description('创建时间：早于指定日期'),
  Schema.const('created-after').description('创建时间：晚于指定日期'),
  Schema.const('updated-before').description('更新时间：早于指定日期'),
  Schema.const('updated-after').description('更新时间：晚于指定日期'),
  Schema.const('created-within').description('创建时间：最近 N 天内'),
  Schema.const('updated-within').description('更新时间：最近 N 天内'),
  Schema.const('custom').description('自定义高级条件'),
])

const MarketSilentRules = Schema.array(Schema.object({
  type: MarketSilentRuleType.default('preview').description('规则类型'),
  value: Schema.string().default('').description('规则值。状态类留空；日期类填写 YYYY-MM-DD，例如 2024-01-01；最近 N 天填写数字，例如 30；自定义规则填写搜索条件，例如 category:adapter。'),
  note: Schema.string().default('').description('备注'),
  enabled: Schema.boolean().default(true).description('是否启用'),
})).role('table').default([]).description('插件市场永久静默过滤。添加规则后，命中的插件会直接从市场页隐藏，不会显示在搜索框中。状态类不需要填写值；日期类填写 YYYY-MM-DD；最近 N 天填写数字。')

export const Config: Schema<Config> = Schema.object({
  frontendMode: Schema.union([
    Schema.const('performance').description('性能模式'),
    Schema.const('polished').description('精致模式'),
  ]).role('radio').default('performance').description('Frontend display mode.'),
  depsLayout: Schema.union([
    Schema.const('grid').description('网格'),
    Schema.const('list').description('列表'),
  ]).role('radio').default('grid').description('Dependencies page layout.'),
  idleProbe: Schema.boolean().default(true).description('Run dependency and market metadata probes while Console is idle.'),
  idleProbeDelay: Schema.number().role('time').default(Time.minute * 5).description('How long Console must stay idle before the background probe starts.'),
  idleProbeBootDelay: Schema.number().role('time').default(Time.minute).description('Minimum delay after startup before idle probing is allowed.'),
  idleProbeInterval: Schema.number().role('time').default(Time.hour * 6).description('Minimum interval between idle background probes.'),
  bulkMode: Schema.boolean().default(false).hidden().description('Batch operation mode for dependency changes.'),
  removeConfig: Schema.union([
    Schema.const(undefined).description('Ask every time'),
    Schema.const(true).description('Always remove plugin config'),
    Schema.const(false).description('Never remove plugin config'),
  ]).hidden().description('Whether to remove existing plugin config when uninstalling a plugin.'),
  updateIgnoredPackages: Schema.string().role('textarea').hidden().description('Dependency package names that should not be checked for updates. One package per line, or separated by commas.'),
  updateIgnoreDuration: Schema.number().role('time').default(0).hidden().description('Default duration for ignoring one update. 0 means no time-based expiry.'),
  updateIgnoreVersions: Schema.number().min(1).max(20).step(1).default(1).hidden().description('How many consecutive newer versions should be ignored after ignoring one update.'),
  updateIgnorePrerelease: Schema.boolean().default(false).hidden().description('Ignore alpha, beta, rc and other prerelease versions when checking updates.'),
  collapsedGroups: Schema.dict(Boolean).hidden(),
  registry: Installer.Config,
  search: MarketProvider.Config,
  chatlunaTool: Schema.boolean().default(false).description('Enable the ChatLuna plugin market query tool. Requires ChatLuna to be installed and enabled separately.'),
  marketSilentFilters: Schema.string().role('textarea').hidden().description('Legacy permanent silent filters.'),
  marketSilentStatusRules: Schema.array(Schema.any()).hidden(),
  marketSilentDateRules: Schema.array(Schema.any()).hidden(),
  marketSilentRecentRules: Schema.array(Schema.any()).hidden(),
  marketSilentCustomRules: Schema.array(Schema.any()).hidden(),
  marketSilentRules: MarketSilentRules,
}).i18n({
  'zh-CN': require('./locales/schema.zh-CN'),
  'en-US': require('./locales/schema.en-US'),
})

const configPatchKeys: Array<keyof Config> = [
  'frontendMode',
  'depsLayout',
  'marketSilentStatusRules',
  'marketSilentDateRules',
  'marketSilentRecentRules',
  'marketSilentCustomRules',
  'marketSilentRules',
  'marketSilentFilters',
  'idleProbe',
  'idleProbeDelay',
  'idleProbeBootDelay',
  'idleProbeInterval',
  'bulkMode',
  'removeConfig',
  'updateIgnoredPackages',
  'updateIgnoreDuration',
  'updateIgnoreVersions',
  'updateIgnorePrerelease',
]

const configReloadKeys = new Set<keyof Config>([
  'idleProbe',
  'idleProbeDelay',
  'idleProbeBootDelay',
  'idleProbeInterval',
])

function findMarketNextConfigNode(plugins: any, currentConfig: Config): { parent: any, key: string, value: any } | undefined {
  let fallback: { parent: any, key: string, value: any } | undefined
  for (const key in plugins || {}) {
    if (key.startsWith('$')) continue
    const value = plugins[key]
    if (!value || typeof value !== 'object') continue
    const disabled = key.startsWith('~')
    const normalized = disabled ? key.slice(1) : key
    const [name] = normalized.split(':', 1)
    if (value === currentConfig || name === 'market-next' || name === 'koishi-plugin-market-next') {
      if (!disabled) return { parent: plugins, key, value }
      fallback ||= { parent: plugins, key, value }
    }
    if (name === 'group') {
      const nested = findMarketNextConfigNode(value, currentConfig)
      if (nested) return nested
    }
  }
  return fallback
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
  return changed
}

export function removeLegacyCollapsedGroupsConfig(ctx: Context, currentConfig: Config) {
  const target = findMarketNextConfigNode(ctx.loader.config?.plugins, currentConfig)
  if (!target || !Object.prototype.hasOwnProperty.call(target.value, 'collapsedGroups')) return false
  delete target.value.collapsedGroups
  return true
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

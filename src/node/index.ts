import { Context, Dict, pick, Schema, Time } from 'koishi'
import Scanner, { DependencyMetaKey, Registry, RemotePackage } from '@koishijs/registry'
import { gt, maxSatisfying } from 'semver'
import { resolve } from 'path'
import pMap from 'p-map'
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { promises as fsp } from 'fs'
import { createHash } from 'crypto'
import { DependencyProvider, RegistryProvider, RegistryStatusProvider } from './deps'
import { MarketDataStore, MarketDataStorePayload } from './data'
import Installer, { loadManifest } from './installer'
import MarketProvider from './market'
import { applyChatLunaTool } from './chatluna'
import {
  BUNDLE_KEYWORD,
  BundleConfigRemoveRequest,
  BundleConfigRemoveResult,
  BundleInstallRequest,
  BundleInstallResult,
  BundleInstallMember,
  PluginBundleManifest,
  PluginBundleRecord,
  getBundleGroupIdent,
  getBundleMemberIdent,
  getPluginShortname,
  isBundlePackageName,
  parseBundleManifest,
  validateBundleManifest,
} from '../shared/bundle'

export * from '../shared'

export { Installer }

const SELF_PACKAGE = 'koishi-plugin-market-next'

declare module 'koishi' {
  interface Context {
    installer: Installer
  }
}

declare module '@koishijs/console' {
  namespace Console {
    interface Services {
      dependencies: DependencyProvider
      registry: RegistryProvider
      registryStatus: RegistryStatusProvider
      marketData: MarketDataStore
    }
  }

  interface Events {
    'market/install'(deps: Dict<string>, forced?: boolean): Promise<number>
    'market/install-bundle'(request: BundleInstallRequest, forced?: boolean): Promise<BundleInstallResult>
    'market/remove-bundle-configs'(request: BundleConfigRemoveRequest): Promise<BundleConfigRemoveResult>
    'market/update-config'(patch: Partial<Config>): Promise<boolean>
    'market/update-data'(patch: Partial<MarketDataStorePayload>): Promise<MarketDataStorePayload>
    'market/refresh-dependencies'(): Promise<void>
    'market/package'(name: string): Promise<Registry>
    'market/registry'(names: string[]): Promise<Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>>
    'market/ensure-config'(name: string): Promise<boolean>
    'market/avatar'(key: string, url?: string): Promise<AvatarFetchResult | undefined>
  }
}

export const name = 'market'
export const inject = ['http']

export const usage = `
如果插件市场页面提示「无法连接到插件市场」，则可以选择一个 Koishi 社区提供的镜像地址，填入下方对应的配置项中。

## 插件市场（填入 search.endpoint）

- Koishi（全球）：https://registry.koishi.chat/index.json
- [Gitee 聚合](https://k.ilharp.cc/4000)（大陆）：https://gitee.com/shangxueink/koishi-registry-aggregator/raw/gh-pages/market.json
- [t4wefan](https://k.ilharp.cc/2611)（大陆）：https://registry.koishi.t4wefan.pub/index.json
- [Lipraty](https://k.ilharp.cc/3530)（大陆）：https://koi.nyan.zone/registry/index.json
- [itzdrli](https://k.ilharp.cc/9975)（全球）：https://kp.itzdrli.cc
- itzdrli 备用：https://koishi.itzdrli.cc

要浏览更多社区镜像，请访问 [Koishi 论坛上的镜像一览](https://k.ilharp.cc/4000)。`

// ## 软件源（填入 npmRegistryServer）

// - 淘宝（大陆）：https://registry.npmmirror.com
// - 腾讯（大陆）：https://mirrors.cloud.tencent.com/npm
// - npm（全球）：https://registry.npmjs.org
// - cnpm：https://r.cnpmjs.org

export interface Config {
  registry?: Installer.Config
  search?: MarketProvider.Config
  chatlunaTool?: boolean
  frontendMode?: 'performance' | 'polished'
  depsLayout?: 'grid' | 'list'
  marketLayout?: 'grid' | 'list'
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

interface AvatarFetchResult {
  data: string
  type: string
  cached?: boolean
  key?: string
}

const avatarCache = new Map<string, AvatarFetchResult & { expiresAt: number }>()
const AVATAR_CACHE_TTL = Time.day * 7
const AVATAR_CACHE_SWEEP_INTERVAL = Time.hour
const AVATAR_MAX_ENTRIES = 512
const AVATAR_MAX_SIZE = 96 * 1024
const AVATAR_BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain'])
const AVATAR_ALLOWED_HOSTS = new Set(['www.npmjs.com', 'npmjs.com', 's.gravatar.com', 'gravatar.com', 'www.gravatar.com', 'cravatar.cn', 'www.cravatar.cn'])
const AVATAR_DEFAULT_HINTS = new Set(['default', 'mp', 'identicon', 'monsterid', 'wavatar', 'retro', 'robohash', 'blank'])
const AVATAR_FETCH_TIMEOUT = 3000
const AVATAR_HEAD_TIMEOUT = 1200
let avatarDiskCleanupTask: Promise<void> | undefined

interface AvatarDiskCacheEntry extends AvatarFetchResult {
  key: string
  url: string
  cachedAt: number
}

function cleanupAvatarCache() {
  const now = Date.now()
  for (const [key, entry] of avatarCache) {
    if (entry.expiresAt <= now) avatarCache.delete(key)
  }
  while (avatarCache.size > AVATAR_MAX_ENTRIES) {
    const key = avatarCache.keys().next().value
    if (!key) break
    avatarCache.delete(key)
  }
}

function cleanupAvatarCaches(ctx: Context) {
  cleanupAvatarCache()
  void cleanupAvatarDiskCache(ctx)
}

function getAvatarCacheDir(ctx: Context) {
  return resolve(ctx.baseDir, 'cache', 'market-next-avatars')
}

function normalizeAvatarCacheKey(key: string) {
  return key.replace(/[^0-9A-Za-z:@._-]/g, '-').slice(0, 128) || `url:${createHash('sha1').update(key).digest('hex')}`
}

function getAvatarCacheFile(ctx: Context, key: string) {
  return resolve(getAvatarCacheDir(ctx), `${createHash('sha1').update(normalizeAvatarCacheKey(key)).digest('hex')}.json`)
}

function normalizeAvatarDiskCache(value: any, key: string): AvatarDiskCacheEntry | undefined {
  if (!value || typeof value !== 'object') return
  if (value.key && value.key !== key) return
  if (!value.key && value.url !== key) return
  if (typeof value.url !== 'string' || !value.url) return
  if (typeof value.type !== 'string' || !value.type.startsWith('image/')) return
  if (typeof value.data !== 'string' || !value.data) return
  const cachedAt = Number(value.cachedAt)
  if (!Number.isFinite(cachedAt)) return
  if (Date.now() - cachedAt > AVATAR_CACHE_TTL) return
  return { key, url: value.url, type: value.type, data: value.data, cachedAt }
}

async function readAvatarDiskCache(ctx: Context, key: string): Promise<AvatarFetchResult | undefined> {
  try {
    const file = getAvatarCacheFile(ctx, key)
    const entry = normalizeAvatarDiskCache(JSON.parse(await fsp.readFile(file, 'utf8')), key)
    if (!entry) {
      void fsp.unlink(file).catch(() => {})
      return
    }
    if (isAvatarCacheLikelyDefault(entry.url, key)) {
      void fsp.unlink(file).catch(() => {})
      return
    }
    avatarCache.set(key, { data: entry.data, type: entry.type, expiresAt: entry.cachedAt + AVATAR_CACHE_TTL })
    return { data: entry.data, type: entry.type, cached: true }
  } catch (error) {
    if ((error as any)?.code !== 'ENOENT') {
      ctx.logger('market').debug(`failed to read avatar disk cache: ${error instanceof Error ? error.message : error}`)
    }
  }
}

async function writeAvatarDiskCache(ctx: Context, key: string, url: string, result: AvatarFetchResult) {
  try {
    await fsp.mkdir(getAvatarCacheDir(ctx), { recursive: true })
    const file = getAvatarCacheFile(ctx, key)
    const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`
    const entry: AvatarDiskCacheEntry = {
      key,
      url,
      type: result.type,
      data: result.data,
      cachedAt: Date.now(),
    }
    await fsp.writeFile(tempFile, JSON.stringify(entry))
    await fsp.rename(tempFile, file)
  } catch (error) {
    ctx.logger('market').debug(`failed to write avatar disk cache: ${error instanceof Error ? error.message : error}`)
  }
}

async function cleanupAvatarDiskCache(ctx: Context) {
  if (avatarDiskCleanupTask) return avatarDiskCleanupTask
  avatarDiskCleanupTask = (async () => {
    try {
      const dir = getAvatarCacheDir(ctx)
      const files = await fsp.readdir(dir).catch(() => [])
      const entries = await Promise.all(files
        .filter(file => file.endsWith('.json'))
        .map(async (file) => {
          const path = resolve(dir, file)
          try {
            const stat = await fsp.stat(path)
            let cachedAt = stat.mtimeMs
            try {
              const value = JSON.parse(await fsp.readFile(path, 'utf8'))
              cachedAt = Number(value.cachedAt) || cachedAt
              if (!value?.key || !value?.url || typeof value?.data !== 'string' || typeof value?.type !== 'string') {
                await fsp.unlink(path).catch(() => {})
                return
              }
              if (isAvatarCacheLikelyDefault(value.url, normalizeAvatarCacheKey(value.key))) {
                await fsp.unlink(path).catch(() => {})
                return
              }
            } catch {
              await fsp.unlink(path).catch(() => {})
              return
            }
            if (Date.now() - cachedAt > AVATAR_CACHE_TTL) {
              await fsp.unlink(path).catch(() => {})
              return
            }
            return { path, cachedAt }
          } catch {
            return
          }
        }))
      const alive = entries
        .filter((entry): entry is { path: string, cachedAt: number } => !!entry)
        .sort((a, b) => b.cachedAt - a.cachedAt)
      await Promise.all(alive.slice(AVATAR_MAX_ENTRIES).map(entry => fsp.unlink(entry.path).catch(() => {})))
    } finally {
      avatarDiskCleanupTask = undefined
    }
  })()
  return avatarDiskCleanupTask
}

async function clearAvatarCacheStorage(ctx: Context) {
  const memory = avatarCache.size
  avatarCache.clear()
  if (avatarDiskCleanupTask) await avatarDiskCleanupTask.catch(() => {})
  const dir = getAvatarCacheDir(ctx)
  const files = await fsp.readdir(dir).catch((error) => {
    if ((error as any)?.code === 'ENOENT') return [] as string[]
    throw error
  })
  const disk = files.filter(file => file.endsWith('.json')).length
  await fsp.rm(dir, { recursive: true, force: true })
  return { memory, disk }
}

async function fetchAvatar(ctx: Context, rawKey: string, rawUrl?: string): Promise<AvatarFetchResult | undefined> {
  const cacheKey = normalizeAvatarCacheKey(rawKey)
  cleanupAvatarCache()
  const cached = avatarCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return { data: cached.data, type: cached.type, cached: true }
  }
  const diskCached = await readAvatarDiskCache(ctx, cacheKey)
  if (diskCached || !rawUrl) return diskCached

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return
  }
  if (!['http:', 'https:'].includes(url.protocol)) return
  if (await isBlockedAvatarTarget(url)) return

  const sourceUrl = url.toString()
  try {
    if (!isAllowedAvatarHost(normalizeAvatarHostname(url.hostname))) try {
      const head = await ctx.http('HEAD', sourceUrl, {
        timeout: AVATAR_HEAD_TIMEOUT,
        validateStatus: status => status >= 200 && status < 600,
        headers: {
          accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml;q=0.8,*/*;q=0.1',
        },
      })
      if (head.status < 400) {
        const headLength = Number(head.headers.get('content-length'))
        if (Number.isFinite(headLength) && headLength > AVATAR_MAX_SIZE) return
      }
    } catch (error) {
      ctx.logger('market').debug(`avatar HEAD skipped: url=${sourceUrl}, error=${error instanceof Error ? error.message : error}`)
    }

    const response = await ctx.http(sourceUrl, {
      timeout: AVATAR_FETCH_TIMEOUT,
      responseType: 'arraybuffer',
      validateStatus: status => status >= 200 && status < 600,
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml;q=0.8,*/*;q=0.1',
      },
    })
    if (response.status >= 500) return
    if (response.status >= 400) return
    const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || ''
    if (!type.startsWith('image/')) {
      return
    }
    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > AVATAR_MAX_SIZE) {
      return
    }
    if (!response.data.byteLength || response.data.byteLength > AVATAR_MAX_SIZE) {
      return
    }
    if (isAvatarDefaultResponse(response.headers)) return

    const result: AvatarFetchResult = {
      type,
      data: Buffer.from(response.data).toString('base64'),
    }
    avatarCache.set(cacheKey, { ...result, expiresAt: Date.now() + AVATAR_CACHE_TTL })
    void writeAvatarDiskCache(ctx, cacheKey, sourceUrl, result)
    cleanupAvatarCache()
    return result
  } catch (error) {
    throw error
  }
}

function isAvatarCacheLikelyDefault(url: string, key: string) {
  try {
    const parsed = new URL(url)
    const hostname = normalizeAvatarHostname(parsed.hostname)
    const isGravatarHost = ['cravatar.cn', 'www.cravatar.cn', 's.gravatar.com', 'gravatar.com', 'www.gravatar.com'].includes(hostname)
    if (!isGravatarHost) return false
    if (getAvatarDefaultMode(parsed)) return true
    if (!key.startsWith('gravatar:')) return false
    const mode = (parsed.searchParams.get('d') || parsed.searchParams.get('default') || '').trim().toLowerCase()
    return mode !== '404'
  } catch {
    return false
  }
}

function getAvatarDefaultMode(url: URL) {
  const value = url.searchParams.get('d') || url.searchParams.get('default') || ''
  const normalized = value.trim().toLowerCase()
  return normalized && AVATAR_DEFAULT_HINTS.has(normalized) ? normalized : ''
}

function isAvatarDefaultResponse(headers: Headers) {
  const from = headers.get('avatar-from')?.trim().toLowerCase()
  return from === 'default' || from === 'mp'
}

async function isBlockedAvatarTarget(url: URL) {
  const hostname = normalizeAvatarHostname(url.hostname)
  if (!hostname || AVATAR_BLOCKED_HOSTS.has(hostname)) return true
  if (isAllowedAvatarHost(hostname)) return false
  const directIp = isIP(hostname)
  if (directIp) return isPrivateAddress(hostname, directIp)
  try {
    const records = await lookup(hostname, { all: true, verbatim: false })
    if (!records.length) return true
    return records.some(record => isPrivateAddress(record.address, record.family))
  } catch {
    return true
  }
}

function isAllowedAvatarHost(hostname: string) {
  return AVATAR_ALLOWED_HOSTS.has(hostname)
}

function normalizeAvatarHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1').replace(/\.$/, '')
}

function isPrivateAddress(address: string, family = isIP(address)) {
  if (family === 4) {
    const parts = address.split('.').map(part => Number(part))
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
    const [a, b] = parts
    return a === 0
      || a === 10
      || a === 127
      || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31
      || a === 192 && b === 168
      || a >= 224
  }
  if (family === 6) {
    const value = address.toLowerCase()
    const first = Number.parseInt(value.split(':')[0] || '0', 16)
    return value === '::1'
      || value === '::'
      || value.startsWith('::ffff:')
      || (Number.isFinite(first) && (first & 0xffc0) === 0xfe80)
      || value.startsWith('fc')
      || value.startsWith('fd')
      || value.startsWith('ff')
  }
  return true
}

function finiteNumber(value: any) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
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
  marketLayout: Schema.union([
    Schema.const('grid').description('网格'),
    Schema.const('list').description('列表'),
  ]).role('radio').default('grid').description('Market page layout.'),
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
  chatlunaTool: Schema.boolean().default(false).description('Enable ChatLuna plugin market query tool.'),
  marketSilentFilters: Schema.string().role('textarea').hidden().description('Legacy permanent silent filters.'),
  marketSilentStatusRules: Schema.array(Schema.any()).hidden(),
  marketSilentDateRules: Schema.array(Schema.any()).hidden(),
  marketSilentRecentRules: Schema.array(Schema.any()).hidden(),
  marketSilentCustomRules: Schema.array(Schema.any()).hidden(),
  marketSilentRules: MarketSilentRules,
}).i18n({
  'zh-CN': require('./locales/schema.zh-CN'),
})

function hasPluginConfig(plugins: any, shortname: string): boolean {
  for (const key in plugins || {}) {
    if (key.startsWith('$')) continue
    const [prefix] = key.split(':', 1)
    const name = prefix.replace(/^~/, '')
    if (name === shortname) return true
    if (name === 'group' && hasPluginConfig(plugins[key], shortname)) return true
  }
  return false
}

function findPluginConfig(plugins: any, shortname: string, group?: any): { key: string, parent: any, inGroup: boolean, value: any } | undefined {
  for (const key in plugins || {}) {
    if (key.startsWith('$')) continue
    const value = plugins[key]
    const [prefix] = key.split(':', 1)
    const name = prefix.replace(/^~/, '')
    if (name === shortname) return { key, parent: plugins, inGroup: !!group && plugins === group, value }
    if (name === 'group') {
      const found = findPluginConfig(value, shortname, group)
      if (found) return found
    }
  }
}

function hasPluginConfigInGroup(plugins: any, shortname: string) {
  for (const key in plugins || {}) {
    if (key.startsWith('$')) continue
    const [prefix] = key.split(':', 1)
    const name = prefix.replace(/^~/, '')
    if (name === shortname) return true
  }
  return false
}

function createDisabledPluginConfig(ctx: Context, shortname: string) {
  const plugins = ctx.loader.config?.plugins
  if (!plugins || !ctx.loader.writable) return
  let ident: string
  let key: string
  do {
    ident = Math.random().toString(36).slice(2, 8)
    key = `~${shortname}:${ident}`
  } while (key in plugins)
  plugins[key] = {}
  return key
}

function isPluginBundleDependency(name: string) {
  if (isBundlePackageName(name)) return true
  try {
    const meta = loadManifest(name)
    return !!parseBundleManifest((meta.koishi as any)?.bundle)
      || meta.keywords?.some(keyword => keyword.toLowerCase() === BUNDLE_KEYWORD)
  } catch {
    return false
  }
}

const configPatchKeys: Array<keyof Config> = [
  'frontendMode',
  'depsLayout',
  'marketLayout',
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
  'collapsedGroups',
]

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

function ensureMarketNextConfigDefaults(ctx: Context, currentConfig: Config) {
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
  if (target.value.marketLayout !== 'grid' && target.value.marketLayout !== 'list') {
    target.value.marketLayout = 'grid'
    changed = true
  }
  return changed
}

async function updateMarketNextConfig(ctx: Context, currentConfig: Config, patch: Partial<Config>) {
  const target = findMarketNextConfigNode(ctx.loader.config?.plugins, currentConfig)
  if (!target) return false
  let changed = false
  for (const key of configPatchKeys) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
    target.value[key] = key === 'marketSilentRules'
      ? normalizeMarketSilentRules(patch[key])
      : patch[key] as never
    changed = true
  }
  if (!changed) return false
  await ctx.loader.writeConfig(true)
  const parent = findPluginParentContext(ctx.loader.entry, target.parent)
  if (parent && !target.key.startsWith('~')) {
    await ctx.loader.reload(parent, target.key, target.value)
  }
  await ctx.get('console')?.refresh('config')
  await ctx.get('console')?.refresh('entry')
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

async function requestPluginRuntime(ctx: Context, name: string) {
  await ctx.get('console')?.listeners['config/request-runtime']?.callback.call(null, name)
}

async function ensurePluginConfig(ctx: Context, name: string, write = true) {
  if (!Scanner.isPlugin(name)) return false
  if (name === SELF_PACKAGE) return false
  if (isPluginBundleDependency(name)) {
    ctx.logger('market').debug(`skip default config entry for plugin bundle: ${name}`)
    return false
  }

  const shortname = getPluginShortname(name)
  if (hasPluginConfig(ctx.loader.config?.plugins, shortname)) return false

  await requestPluginRuntime(ctx, name).catch(error => ctx.logger('market').warn(error))
  if (hasPluginConfig(ctx.loader.config?.plugins, shortname)) return false

  const key = createDisabledPluginConfig(ctx, shortname)
  if (!key) return false
  if (write) await ctx.loader.writeConfig()
  ctx.logger('market').info('created disabled default config entry %c for %c', key, name)
  return true
}

async function ensurePluginConfigs(ctx: Context, names: string[]) {
  const start = Date.now()
  let changed = false
  let checked = 0
  for (const name of names.filter(name => Scanner.isPlugin(name))) {
    if (!ctx.scope.isActive) return false
    if (await ensurePluginConfig(ctx, name, false)) changed = true
    if (++checked % 20 === 0) await sleep(0)
  }
  if (!changed) return false
  await ctx.loader.writeConfig()
  await Promise.all([
    ctx.get('console')?.refresh('config'),
    ctx.get('console')?.refresh('packages'),
  ])
  ctx.logger('market').info(`plugin config ensure completed: checked=${checked}, elapsed=${Date.now() - start}ms`)
  return true
}

async function ensureInstalledPluginConfigs(ctx: Context) {
  const start = Date.now()
  const manifest = loadManifest(ctx.baseDir)
  const names = Object.keys(manifest.dependencies ?? {})
    .filter(name => Scanner.isPlugin(name))
    .filter(name => !isPluginBundleDependency(name))
  const missing = names.filter(name => !hasPluginConfig(ctx.loader.config?.plugins, getPluginShortname(name)))
  ctx.logger('market').debug(`installed plugin config repair scan: total=${names.length}, missing=${missing.length}`)
  if (!missing.length) return false
  await sleep(0)
  const changed = await ensurePluginConfigs(ctx, missing)
  ctx.logger('market').info(`installed plugin config repair scan completed: total=${names.length}, missing=${missing.length}, changed=${changed}, elapsed=${Date.now() - start}ms`)
  return changed
}

interface BundleGroup {
  key: string
  plugins: any
  changed?: boolean
}

function getBundleGroup(ctx: Context, packageName: string): BundleGroup | undefined {
  const plugins = ctx.loader.config?.plugins
  if (!plugins) return
  const key = `group:${getBundleGroupIdent(packageName)}`
  if (!plugins[key]) return
  return { key, plugins: plugins[key] }
}

function ensureBundleGroup(ctx: Context, packageName: string, bundle: PluginBundleManifest): BundleGroup | undefined {
  const plugins = ctx.loader.config?.plugins
  if (!plugins || !ctx.loader.writable) return
  const ident = getBundleGroupIdent(packageName)
  const key = `group:${ident}`
  let changed = false
  if (!plugins[key]) {
    plugins[key] = {}
    changed = true
  }
  if (!plugins[key].$label) {
    plugins[key].$label = bundle.label || getPluginShortname(packageName)
    changed = true
  }
  if (plugins[key].$collapsed === undefined) {
    plugins[key].$collapsed = false
    changed = true
  }
  return { key, plugins: plugins[key], changed }
}

async function removeBundleConfigs(ctx: Context, request: BundleConfigRemoveRequest): Promise<BundleConfigRemoveResult> {
  const group = getBundleGroup(ctx, request.package)
  const result: BundleConfigRemoveResult = {
    groupKey: group?.key,
    removed: [],
  }
  if (!group || !ctx.loader.writable) return result

  const memberNames = new Set((request.members ?? [])
    .map(member => getPluginShortname(member.plugin || member.package))
    .filter(Boolean))
  let needsFullReload = false

  for (const key of Object.keys(group.plugins)) {
    if (key.startsWith('$')) continue
    const [prefix] = key.split(':', 1)
    const shortname = prefix.replace(/^~/, '')
    if (memberNames.size && !memberNames.has(shortname)) continue
    delete group.plugins[key]
    result.removed.push(key)
    if (!key.startsWith('~')) needsFullReload = true
  }

  const children = Object.keys(group.plugins).filter(key => !key.startsWith('$'))
  if (request.removeEmptyGroup !== false && !children.length) {
    delete ctx.loader.config.plugins[group.key]
    result.removedGroup = true
  }

  if (result.removed.length || result.removedGroup) {
    await ctx.loader.writeConfig()
    await Promise.all([
      ctx.get('console')?.refresh('config'),
      ctx.get('console')?.refresh('packages'),
    ])
    ctx.logger('market').info(`plugin bundle config cleanup completed: bundle=${request.package}, removed=${result.removed.length}, removedGroup=${!!result.removedGroup}`)
    if (needsFullReload) {
      setTimeout(() => {
        if (ctx.scope.isActive) ctx.loader.fullReload()
      }, Time.second)
    }
  }

  return result
}

async function assertNoDirectBundleCycles(ctx: Context, packageName: string, members: BundleInstallMember[]) {
  const bundleName = packageName.toLowerCase()
  for (const member of members) {
    try {
      const registry = await ctx.installer.getRegistry(member.package)
      const versions = Object.keys(registry?.versions ?? {})
      const version = maxSatisfying(versions, member.version, { includePrerelease: true })
      if (!version) continue
      const remote = registry.versions?.[version]
      const bundle = parseBundleManifest((remote?.koishi as any)?.bundle)
      if (!bundle?.members.some(item => item.package.toLowerCase() === bundleName)) continue
      throw new Error(`plugin bundle has a direct cycle: ${packageName} <-> ${member.package}`)
    } catch (error) {
      if (error instanceof Error && error.message.includes('direct cycle')) throw error
      ctx.logger('market').debug(`plugin bundle cycle check skipped: bundle=${packageName}, member=${member.package}, error=${error instanceof Error ? error.message : error}`)
    }
  }
}

async function installBundle(ctx: Context, dataStore: MarketDataStore, request: BundleInstallRequest, forced?: boolean): Promise<BundleInstallResult> {
  const start = Date.now()
  if (!request.version) throw new Error('bundle package version is required')
  const registry = await ctx.installer.getRegistry(request.package)
  if (!registry?.versions) throw new Error(`bundle package metadata not loaded: ${request.package}`)
  const remote = registry.versions[request.version]
  if (!remote) throw new Error(`bundle package version not found: ${request.package}@${request.version}`)
  const bundle = parseBundleManifest((remote?.koishi as any)?.bundle)
  const validation = validateBundleManifest(request.package, bundle, {
    keyword: remote?.keywords?.some(keyword => keyword.toLowerCase() === BUNDLE_KEYWORD),
  })
  if (!validation.valid) {
    throw new Error(`invalid plugin bundle: ${validation.errors.join('; ')}`)
  }
  const manifest = bundle!

  const requestMembers = new Map((request.members ?? []).map(member => [`${member.package}\n${member.plugin}`, member]))
  const selected = manifest.members
    .map((member) => {
      const option = requestMembers.get(`${member.package}\n${member.plugin}`)
      return {
        ...member,
        selected: !!option?.selected,
        createConfig: option?.createConfig !== false,
        usePreset: option?.usePreset === true,
        move: option?.move === true,
        config: option?.config ?? member.config,
      }
    })
    .filter(member => member.selected)
  if (!selected.length) throw new Error('plugin bundle has no selected members')
  await assertNoDirectBundleCycles(ctx, request.package, selected)

  const beforeDeps = loadManifest(ctx.baseDir).dependencies ?? {}
  const deps: Dict<string> = { [request.package]: request.version }
  for (const member of selected) {
    deps[member.package] = member.version
  }

  const configured: string[] = []
  const moved: string[] = []
  const skipped: string[] = []
  let group: BundleGroup | undefined
  let groupChanged = false
  let wroteConfig = false
  const writeBundleConfigs = async () => {
    if (wroteConfig) return
    group = ensureBundleGroup(ctx, request.package, manifest) ?? getBundleGroup(ctx, request.package)
    groupChanged ||= !!group?.changed
    for (const member of selected) {
      if (!member.createConfig) {
        skipped.push(member.package)
        continue
      }
      const shortname = member.plugin || getPluginShortname(member.package)
      group ||= ensureBundleGroup(ctx, request.package, manifest)
      groupChanged ||= !!group?.changed
      if (!group) {
        skipped.push(member.package)
        continue
      }

      if (hasPluginConfigInGroup(group.plugins, shortname)) continue

      const existing = findPluginConfig(ctx.loader.config?.plugins, shortname, group.plugins)
      if (existing && existing.parent !== group.plugins && member.move) {
        const ident = getBundleMemberIdent(request.package, member)
        const fallbackKey = `~${shortname}:${ident}`
        const targetKey = existing.key in group.plugins ? fallbackKey : existing.key
        if (targetKey in group.plugins) {
          skipped.push(member.package)
          continue
        }
        group.plugins[targetKey] = existing.value ?? {}
        delete existing.parent[existing.key]
        moved.push(member.package)
        continue
      }

      const ident = getBundleMemberIdent(request.package, member)
      const key = `~${shortname}:${ident}`
      if (group.plugins[key]) continue
      group.plugins[key] = member.usePreset ? member.config || {} : {}
      configured.push(member.package)
    }
    if (groupChanged || configured.length || moved.length) await ctx.loader.writeConfig()
    wroteConfig = true
  }

  const code = await ctx.installer.install(deps, forced, writeBundleConfigs)

  if (!code) {
    await writeBundleConfigs()
  }

  await Promise.all([
    ctx.get('console')?.refresh('dependencies'),
    ctx.get('console')?.refresh('registry'),
    ctx.get('console')?.refresh('packages'),
    ctx.get('console')?.refresh('config'),
  ])
  const record: PluginBundleRecord | undefined = code ? undefined : {
    package: request.package,
    version: request.version,
    label: manifest.label,
    groupKey: group?.key,
    installedAt: Date.now(),
    members: selected.map(member => ({
      package: member.package,
      plugin: member.plugin,
      version: member.version,
      required: member.required,
      selected: true,
      installedByBundle: !beforeDeps[member.package],
      configured: configured.includes(member.package),
      moved: moved.includes(member.package),
      skipped: skipped.includes(member.package),
      usePreset: member.usePreset,
    })),
  }
  if (record) await dataStore.setBundleRecord(record)
  ctx.logger('market').info(`plugin bundle install completed: bundle=${request.package}, members=${selected.length}, configured=${configured.length}, moved=${moved.length}, skipped=${skipped.length}, code=${code}, elapsed=${Date.now() - start}ms`)
  return {
    code,
    installed: Object.keys(deps),
    configured,
    moved,
    skipped,
    groupKey: group?.key,
    record,
  }
}

function setupIdleProbe(ctx: Context, config: Config) {
  if (config.idleProbe === false) return

  const logger = ctx.logger('market')
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let lastProbe = 0
  let lastFailure = 0

  const getClientCount = () => {
    const clients = ctx.console.clients as any
    if (!clients) return 0
    if (typeof clients.size === 'number') return clients.size
    return Object.keys(clients).length
  }
  const clearIdleTimer = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const getDelay = () => Math.max(0, config.idleProbeDelay ?? Time.minute * 5)
  const getBootDelay = () => Math.max(0, config.idleProbeBootDelay ?? Time.minute)
  const getInterval = () => Math.max(0, config.idleProbeInterval ?? Time.hour * 6)

  const runProbe = async () => {
    clearIdleTimer()
    if (!ctx.scope.isActive) return
    if (getClientCount()) return
    if (ctx.installer.isInstalling) {
      logger.debug('skip idle background probe because dependency install is active')
      schedule(getDelay())
      return
    }
    const bootWait = getBootDelay() - (Date.now() - startedAt)
    if (bootWait > 0) {
      schedule(bootWait)
      return
    }
    const retryWait = lastFailure ? Math.min(Time.minute * 5, getInterval()) - (Date.now() - lastFailure) : 0
    if (!lastProbe && retryWait > 0) {
      logger.debug(`skip idle background probe because retry gate is active: remaining=${retryWait}ms`)
      schedule(retryWait)
      return
    }
    const intervalWait = lastProbe ? getInterval() - (Date.now() - lastProbe) : 0
    if (intervalWait > 0) {
      logger.debug(`skip idle background probe because interval gate is active: remaining=${intervalWait}ms`)
      schedule(intervalWait)
      return
    }
    if (running) return

    running = true
    const probeStartedAt = Date.now()
    logger.info(`idle background probe started: clients=0, delay=${getDelay()}ms, interval=${getInterval()}ms`)
    try {
      const [depsResult, marketResult] = await Promise.allSettled([
        ctx.installer.probeDependenciesInBackground('idle').then(() => true),
        ctx.console.services.market?.probeInBackground?.('idle probe') ?? Promise.resolve(false),
      ])
      const succeeded = depsResult.status === 'fulfilled' && depsResult.value === true
        || marketResult.status === 'fulfilled' && marketResult.value !== false
      if (succeeded) {
        lastProbe = Date.now()
        lastFailure = 0
        logger.info(`idle background probe completed: elapsed=${Date.now() - probeStartedAt}ms`)
      } else {
        lastFailure = Date.now()
        const reason = depsResult.status === 'rejected'
          ? depsResult.reason
          : marketResult.status === 'rejected'
            ? marketResult.reason
            : 'no probe result'
        logger.warn(`idle background probe failed: ${reason instanceof Error ? reason.message : reason}`)
      }
    } catch (error) {
      lastFailure = Date.now()
      logger.warn(`idle background probe failed: ${error instanceof Error ? error.message : error}`)
    } finally {
      running = false
      if (!getClientCount()) schedule(lastProbe ? getInterval() : Math.min(Time.minute * 5, getInterval()))
    }
  }

  const schedule = (delay = getDelay()) => {
    clearIdleTimer()
    if (!ctx.scope.isActive || config.idleProbe === false) return
    if (getClientCount()) return
    timer = setTimeout(() => void runProbe(), Math.max(0, delay))
    logger.debug(`idle background probe scheduled: delay=${Math.max(0, delay)}ms`)
  }

  ctx.on('console/connection', () => {
    if (getClientCount()) {
      clearIdleTimer()
      logger.debug(`idle background probe cancelled: clients=${getClientCount()}`)
    } else {
      schedule()
    }
  })

  ctx.on('ready', () => {
    if (!getClientCount()) schedule(Math.max(getDelay(), getBootDelay()))
  })

  ctx.effect(() => () => clearIdleTimer())
}

export function apply(ctx: Context, config: Config = {}) {
  if (!ctx.loader?.writable) {
    return ctx.logger('app').warn('koishi-plugin-market-next is only available for json/yaml config file')
  }

  if (ensureMarketNextConfigDefaults(ctx, config)) {
    ctx.logger('market').info('created missing market-next display defaults in Koishi config')
    void ctx.loader.writeConfig(true)
      .then(() => ctx.get('console')?.refresh('config'))
      .catch(error => ctx.logger('market').warn(error))
  }

  applyChatLunaTool(ctx, config)

  ctx.plugin(Installer, config.registry ?? {})

  ctx.inject(['installer'], (ctx) => {
    ctx.i18n.define('zh-CN', require('./locales/message.zh-CN'))

    ctx.command('plugin.install <name>', { authority: 4 })
      .alias('.i')
      .action(async ({ session }, name) => {
        if (!name) return session.text('.expect-name')

        // check local dependencies
        const names = ctx.installer.resolveName(name)
        const deps = await ctx.installer.getDeps()
        name = names.find((name) => deps[name])
        if (name) return session.text('.already-installed')

        // find proper version
        const result = await ctx.installer.findVersion(names)
        if (!result) return session.text('.not-found')

        // set restart message
        ctx.loader.envData.message = {
          ...pick(session, ['sid', 'channelId', 'guildId', 'isDirect']),
          content: session.text('.success'),
        }
        await ctx.installer.install(result, undefined, () => ensurePluginConfigs(ctx, Object.keys(result)))
        await ensurePluginConfigs(ctx, Object.keys(result))
        ctx.loader.envData.message = null
        return session.text('.success')
      })

    ctx.command('plugin.uninstall <name>', { authority: 4 })
      .alias('.r')
      .action(async ({ session }, name) => {
        if (!name) return session.text('.expect-name')

        // check local dependencies
        const names = ctx.installer.resolveName(name)
        const deps = await ctx.installer.getDeps()
        name = names.find((name) => deps[name])
        if (!name) return session.text('.not-installed')

        await ctx.installer.install({ [name]: null })
        return session.text('.success')
      })

    ctx.command('plugin.upgrade [name...]', { authority: 4 })
      .alias('.update', '.up')
      .option('self', '-s, --koishi')
      .action(async ({ session, options }, ...names) => {
        async function getPackages(names: string[]) {
          if (!names.length) return Object.keys(deps)
          names = names.map((name) => {
            const names = ctx.installer.resolveName(name)
            return names.find((name) => deps[name])
          }).filter(Boolean)
          if (options.self) names.push('koishi')
          return names
        }

        // refresh dependencies
        await ctx.installer.refresh(true, true)
        const deps = await ctx.installer.getDeps({ background: false })
        names = await getPackages(names)
        names = names.filter((name) => {
          const { latest, resolved, invalid } = deps[name]
          try {
            return !invalid && gt(latest, resolved)
          } catch {}
        })
        if (!names.length) return session.text('.all-updated')

        const output = names.map((name) => {
          const { latest, resolved } = deps[name]
          return `${name}: ${resolved} -> ${latest}`
        })
        output.unshift(session.text('.available'))
        output.push(session.text('.prompt'))
        await session.send(output.join('\n'))
        const result = await session.prompt()
        if (!['Y', 'y'].includes(result?.trim())) {
          return session.text('.cancelled')
        }

        ctx.loader.envData.message = {
          ...pick(session, ['sid', 'channelId', 'guildId', 'isDirect']),
          content: session.text('.success'),
        }
        await ctx.installer.install(names.reduce((result, name) => {
          result[name] = deps[name].latest
          return result
        }, {}), undefined, () => ensurePluginConfigs(ctx, names))
        await ensurePluginConfigs(ctx, names)
        ctx.loader.envData.message = null
        return session.text('.success')
      })

    ctx.command('plugin.clear-avatar-cache', { authority: 4 })
      .action(async ({ session }) => {
        const { memory, disk } = await clearAvatarCacheStorage(ctx)
        return session.text('.success', [memory, disk])
      })
  })

  ctx.inject(['console', 'installer'], (ctx) => {
    ctx.plugin(DependencyProvider)
    ctx.plugin(RegistryProvider)
    ctx.plugin(RegistryStatusProvider)
    const dataStore = new MarketDataStore(ctx)
    ctx.plugin(MarketProvider, config.search ?? {})
    setupIdleProbe(ctx, config)

    ctx.console.addEntry({
      dev: resolve(__dirname, '../../client/index.ts'),
      prod: resolve(__dirname, '../../dist'),
    })

    ctx.console.addListener('market/install', async (deps, forced) => {
      const installNames = Object.entries(deps)
        .filter(([, version]) => version)
        .map(([name]) => name)
        .filter(name => name !== SELF_PACKAGE)
      const code = await ctx.installer.install(deps, forced, installNames.length
        ? () => ensurePluginConfigs(ctx, installNames)
        : undefined)
      if (!code) {
        await ensurePluginConfigs(ctx, installNames)
      }
      await Promise.all([
        ctx.get('console')?.refresh('dependencies'),
        ctx.get('console')?.refresh('registry'),
        ctx.get('console')?.refresh('packages'),
        ctx.get('console')?.refresh('config'),
      ])
      return code
    }, { authority: 4 })

    ctx.console.addListener('market/install-bundle', async (request, forced) => {
      return installBundle(ctx, dataStore, request, forced)
    }, { authority: 4 })

    ctx.console.addListener('market/remove-bundle-configs', async (request) => {
      return removeBundleConfigs(ctx, request)
    }, { authority: 4 })

    ctx.console.addListener('market/update-config', async (patch) => {
      return updateMarketNextConfig(ctx, config, patch)
    }, { authority: 4 })

    ctx.console.addListener('market/update-data', async (patch) => {
      return dataStore.patch(patch)
    }, { authority: 4 })

    ctx.console.addListener('market/refresh-dependencies', async () => {
      await ctx.installer.refresh(true)
      await ctx.get('console')?.refresh('config')
    }, { authority: 4 })

    ctx.console.addListener('market/package', async (name) => {
      return ctx.installer.getRegistry(name)
    }, { authority: 4 })

    ctx.console.addListener('market/registry', async (names) => {
      const entries = await pMap(names, async (name) => {
        try {
          const meta = await ctx.installer.getPackage(name)
          if (!meta) return
          return [name, meta] as const
        } catch (error) {
          ctx.logger('market').debug(`skip registry metadata for ${name}: ${error instanceof Error ? error.message : error}`)
        }
      }, { concurrency: ctx.installer.config.concurrency ?? 4 })
      return Object.fromEntries(entries.filter(Boolean))
    }, { authority: 4 })

    ctx.console.addListener('market/ensure-config', async (name) => {
      return ensurePluginConfig(ctx, name)
    }, { authority: 4 })

    ctx.console.addListener('market/avatar', async (key, url) => {
      try {
        return await fetchAvatar(ctx, key, url)
      } catch (error) {
        ctx.logger('market').debug(`avatar fetch failed: ${error instanceof Error ? error.message : error}`)
      }
    }, { authority: 4 })

    ctx.on('ready', () => {
      void dataStore.migrateFromConfig(config)
      const timer = setTimeout(() => {
        if (!ctx.scope.isActive) return
        ctx.logger('market').debug('schedule installed plugin config repair after market-next ready')
        void ensureInstalledPluginConfigs(ctx).catch(error => ctx.logger('market').warn(error))
      }, 1000)
      void cleanupAvatarDiskCache(ctx)
      const avatarTimer = setInterval(() => cleanupAvatarCaches(ctx), AVATAR_CACHE_SWEEP_INTERVAL)
      ctx.effect(() => () => {
        clearTimeout(timer)
        clearInterval(avatarTimer)
        avatarCache.clear()
      })
    })
  })
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

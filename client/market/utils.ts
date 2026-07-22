import { SearchObject, User } from '@koishijs/registry'
import { InjectionKey, ref } from 'vue'
import { Dict } from 'cosmokit'
import * as md5 from 'spark-md5'
import { send } from '@koishijs/client'
import { hasBundleKeyword, isBundlePackageName } from '../../src/shared/bundle'
import { useMarketNextI18n } from '../i18n'

export function useMarketI18n() {
  const { t: baseT, locale } = useMarketNextI18n()
  const t = (key: string, ...args: any[]) => baseT(`market.${key}`, ...args)
  return { t, locale }
}

export function getUsers(data: SearchObject) {
  const cached = usersCache.get(data)
  if (cached) return cached
  const result: Record<string, User> = {}
  for (const user of data.package.contributors ?? []) {
    const key = getUserKey(user)
    if (!key) continue
    result[key] ||= user
  }
  const users = !data.package.maintainers.some(user => result[getUserKey(user)])
    ? data.package.maintainers.map(user => ({
      ...user,
      name: user.name || user.username,
    }))
    : Object.values(result)
  usersCache.set(data, users)
  return users
}

export function getUserKey(user: User) {
  return user.email || user.username || user.name
}

export interface AvatarCandidate {
  url: string
  source: string
  cacheKey: string
}

function isHttpUrl(value?: string) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isImageUrl(value?: string) {
  return !!value && /\.(?:png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(value)
}

function normalizeHttpBase(value?: string) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    const path = url.pathname === '/' ? '' : url.pathname
    return `${url.origin}${path}`.replace(/\/+$/, '').replace(/\/avatar$/i, '')
  } catch {
    return ''
  }
}

function getGravatarBases(gravatar?: string) {
  const bases = [
    normalizeHttpBase(gravatar),
    'https://cravatar.cn',
    'https://www.cravatar.cn',
    'https://s.gravatar.com',
    'https://www.gravatar.com',
    'https://gravatar.com',
  ].filter(Boolean) as string[]
  return bases.filter((base, index) => bases.indexOf(base) === index)
}

function toBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function getEmailHash(user: User) {
  if (!user.email) return ''
  return md5.hash(user.email.trim().toLowerCase())
}

function createAvatarUrlCacheKey(url: string) {
  return `url:${md5.hash(normalizeAvatarUrl(url))}`
}

function createGravatarUrls(hash: string, gravatar?: string) {
  if (!hash) return []
  const urls: string[] = []
  for (const base of getGravatarBases(gravatar)) {
    urls.push(`${base}/avatar/${hash}.png?d=404`)
  }
  return urls
}

function createNpmAvatarUrl(hash: string) {
  const upstream = `https://s.gravatar.com/avatar/${hash}.png?size=100&default=404`
  return `https://www.npmjs.com/npm-avatar/${toBase64Url(upstream)}`
}

function baseAvatarCandidates(user: User, gravatar?: string): AvatarCandidate[] {
  const hash = getEmailHash(user)
  const fallbackKey = hash
    ? `gravatar:${hash}`
    : `user:${md5.hash(getUserKey(user) || JSON.stringify(user) || 'anonymous')}`
  const candidates: AvatarCandidate[] = []
  const avatar = (user as User & { avatar?: string, url?: string }).avatar
  if (avatar?.trim() && (isHttpUrl(avatar) || avatar.trim().startsWith('data:'))) {
    const normalized = avatar.trim()
    candidates.push({ url: normalized, source: 'explicit', cacheKey: createAvatarUrlCacheKey(normalized) })
  }
  const url = (user as User & { avatar?: string, url?: string }).url
  if (isHttpUrl(url) && isImageUrl(url)) candidates.push({ url: url!, source: 'url', cacheKey: createAvatarUrlCacheKey(url!) })
  for (const url of createGravatarUrls(hash, gravatar)) {
    candidates.push({ url, source: 'gravatar', cacheKey: fallbackKey })
  }
  if (hash) {
    candidates.push({ url: createNpmAvatarUrl(hash), source: 'npm-avatar', cacheKey: fallbackKey })
  }
  return candidates.filter((candidate, index, array) => {
    return array.findIndex(item => item.url === candidate.url && item.cacheKey === candidate.cacheKey) === index
  })
}

export function getUserAvatarCandidates(user: User, gravatar?: string): AvatarCandidate[] {
  return baseAvatarCandidates(user, gravatar)
}

export function getUserAvatar(user: User, gravatar?: string) {
  return getUserAvatarCandidates(user, gravatar)[0]?.url || ''
}

type AvatarCacheEntry = {
  data: string
  type: string
  cachedAt: number
}

type AvatarFailureEntry = {
  failedAt: number
}

const AVATAR_CACHE_TTL = 1000 * 60 * 60 * 24
const AVATAR_FAILURE_TTL = 1000 * 60 * 10
const AVATAR_CACHE_MAX = 256
const AVATAR_FAILURE_MAX = 256
const avatarCache: Record<string, AvatarCacheEntry> = {}
const avatarFailureCache = ref<Record<string, AvatarFailureEntry>>({})
const pendingAvatarRequests = new Map<string, Promise<string>>()

function normalizeAvatarUrl(url: string) {
  try {
    return new URL(url).toString()
  } catch {
    return url
  }
}

function isDataUrl(value: string) {
  return value.startsWith('data:')
}

function readAvatarCache() {
}

function pruneAvatarCache() {
  const now = Date.now()
  const entries = Object.entries(avatarCache)
    .filter(([, entry]) => now - entry.cachedAt < AVATAR_CACHE_TTL)
    .sort((a, b) => b[1].cachedAt - a[1].cachedAt)
    .slice(0, AVATAR_CACHE_MAX)
  for (const key of Object.keys(avatarCache)) delete avatarCache[key]
  Object.assign(avatarCache, Object.fromEntries(entries))
}

function pruneAvatarFailureCache() {
  const now = Date.now()
  avatarFailureCache.value = Object.fromEntries(Object.entries(avatarFailureCache.value)
    .filter(([, entry]) => now - entry.failedAt < AVATAR_FAILURE_TTL)
    .sort((a, b) => b[1].failedAt - a[1].failedAt)
    .slice(0, AVATAR_FAILURE_MAX))
}

function normalizeAvatarCacheKey(key: string) {
  return key.replace(/[^0-9A-Za-z:@._-]/g, '-').slice(0, 128) || createAvatarUrlCacheKey(key)
}

function cacheAvatar(cacheKey: string, entry: AvatarCacheEntry) {
  readAvatarCache()
  const key = normalizeAvatarCacheKey(cacheKey)
  delete avatarFailureCache.value[key]
  avatarCache[key] = entry
  pruneAvatarCache()
  pruneAvatarFailureCache()
}

export function cacheAvatarFailure(cacheKey: string) {
  if (isDataUrl(cacheKey)) return
  readAvatarCache()
  const key = normalizeAvatarCacheKey(cacheKey)
  avatarFailureCache.value = {
    ...avatarFailureCache.value,
    [key]: { failedAt: Date.now() },
  }
  pruneAvatarFailureCache()
}

export function isAvatarFailureCached(cacheKey: string) {
  if (isDataUrl(cacheKey)) return false
  readAvatarCache()
  const key = normalizeAvatarCacheKey(cacheKey)
  const entry = avatarFailureCache.value[key]
  if (!entry) return false
  if (Date.now() - entry.failedAt >= AVATAR_FAILURE_TTL) {
    delete avatarFailureCache.value[key]
    return false
  }
  return true
}

export function getCachedAvatar(cacheKey: string) {
  if (isDataUrl(cacheKey)) return cacheKey
  readAvatarCache()
  const key = normalizeAvatarCacheKey(cacheKey)
  const entry = avatarCache[key]
  if (!entry) return
  if (Date.now() - entry.cachedAt >= AVATAR_CACHE_TTL) {
    delete avatarCache[key]
    return
  }
  return `data:${entry.type};base64,${entry.data}`
}

export function getCachedAvatarFromCandidates(candidates: AvatarCandidate[]) {
  for (const candidate of candidates) {
    const cached = getCachedAvatar(candidate.cacheKey)
    if (cached) return cached
  }
}

export async function fetchAndCacheAvatar(cacheKey: string, url: string, cacheFailure = true) {
  if (isDataUrl(url)) return url
  readAvatarCache()
  const key = normalizeAvatarCacheKey(cacheKey)
  const sourceUrl = normalizeAvatarUrl(url)
  const cached = getCachedAvatar(key)
  if (cached) return cached
  const pending = pendingAvatarRequests.get(key)
  if (pending) return pending
  const task = (async () => {
    const result = await (send('market/avatar', key, sourceUrl) ?? Promise.resolve(undefined))
      .catch(() => undefined) as { data?: string, type?: string, cached?: boolean } | undefined
    if (result?.data && result.type) {
      cacheAvatar(key, {
        data: result.data,
        type: result.type,
        cachedAt: Date.now(),
      })
      return `data:${result.type};base64,${result.data}`
    }
    if (cacheFailure) cacheAvatarFailure(key)
    return ''
  })().finally(() => {
    pendingAvatarRequests.delete(key)
  })
  pendingAvatarRequests.set(key, task)
  return task
}

export async function fetchCachedAvatar(cacheKey: string) {
  if (isDataUrl(cacheKey)) return cacheKey
  readAvatarCache()
  const key = normalizeAvatarCacheKey(cacheKey)
  const cached = getCachedAvatar(key)
  if (cached) return cached
  const pendingKey = `cache:${key}`
  const pending = pendingAvatarRequests.get(pendingKey)
  if (pending) return pending
  const task = (async () => {
    const result = await (send('market/avatar', key) ?? Promise.resolve(undefined))
      .catch(() => undefined) as { data?: string, type?: string, cached?: boolean } | undefined
    if (result?.data && result.type) {
      cacheAvatar(key, {
        data: result.data,
        type: result.type,
        cachedAt: Date.now(),
      })
      return `data:${result.type};base64,${result.data}`
    }
    return ''
  })().finally(() => {
    pendingAvatarRequests.delete(pendingKey)
  })
  pendingAvatarRequests.set(pendingKey, task)
  return task
}

export function isBundleSearchObject(data: SearchObject) {
  return isBundlePackageName(data.package.name)
    || hasBundleKeyword(data.package.keywords)
}

export function canInstallBundleSearchObject(data: SearchObject) {
  return isBundleSearchObject(data)
}

const aWeekAgo = new Date(Date.now() - 1000 * 3600 * 24 * 7).toISOString()

export interface Badge {
  query: string
  negate: string
  icon?: string
  hidden?(config: MarketConfig, type: 'card' | 'filter'): boolean
}

export const badges: Dict<Badge> = {
  installed: {
    query: 'is:installed',
    negate: 'not:installed',
    hidden(config, type) {
      return !config.installed || type === 'card'
    },
  },
  verified: {
    query: 'is:verified',
    negate: 'not:verified',
  },
  insecure: {
    query: 'is:insecure',
    negate: 'not:insecure',
  },
  preview: {
    query: 'is:preview',
    negate: 'not:preview',
  },
  portable: {
    query: 'is:portable',
    negate: 'not:portable',
    hidden(config, type) {
      return !config.portable || type === 'card'
    },
  },
  bundle: {
    query: 'is:bundle',
    negate: 'not:bundle',
    icon: 'file-archive',
  },
  newborn: {
    query: `created:>${aWeekAgo}`,
    negate: `created:<${aWeekAgo}`,
  },
}

interface Comparator {
  icon: string
  hidden?: boolean
  compare?(a: SearchObject, b: SearchObject, words: string[], config?: MarketConfig): number
}

function normalizeSearchText(value: unknown) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
}

function normalizePackageName(name: string) {
  return normalizeSearchText(name).replace(/(koishi-|^@koishijs\/)plugin-/, '')
}

interface MarketSearchIndex {
  users: User[]
  normalizedName: string
  searchTexts: string[]
  category: string
  bundle: boolean
  createdAt: string
  updatedAt: string
  createdTimestamp: number
  updatedTimestamp: number
  rating?: number
}

const usersCache = new WeakMap<SearchObject, User[]>()
const searchIndexCache = new WeakMap<SearchObject, MarketSearchIndex>()

function getSearchIndex(data: SearchObject): MarketSearchIndex {
  const cached = searchIndexCache.get(data)
  if (cached) return cached
  const description = data.manifest?.description
  const descriptions = typeof description === 'string'
    ? [description]
    : Object.values(description ?? {})
  const rating = Number((data as SearchObject & { rating?: number }).rating)
  const index = {
    users: getUsers(data),
    normalizedName: normalizePackageName(data.package.name),
    searchTexts: [
    ...(data.package.keywords ?? []),
    ...descriptions,
    ].map(normalizeSearchText),
    category: resolveCategory(data.category),
    bundle: isBundleSearchObject(data),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    createdTimestamp: Date.parse(data.createdAt),
    updatedTimestamp: Date.parse(data.updatedAt),
    rating: Number.isFinite(rating) ? rating : undefined,
  }
  searchIndexCache.set(data, index)
  return index
}

function getSimilarityByIndex(index: MarketSearchIndex, word: string) {
  const shortname = index.normalizedName
  if (shortname === word) return 1
  const tokens = shortname.split(/[-/_]/)
  // if (tokens[0] === word) return 0.5
  if (tokens.includes(word)) return 0.5
  if (shortname.startsWith(word)) return 0.4
  // if (tokens[0].startsWith(word)) return 0.3
  if (tokens.some(t => t.startsWith(word))) return 0.3
  if (shortname.includes(word)) return 0.25
  if (tokens.some(t => t.includes(word))) return 0.2
  return index.searchTexts.some(keyword => keyword.includes(word)) ? 0.05 : 0
}

function getSimilarity(data: SearchObject, word: string) {
  return getSimilarityByIndex(getSearchIndex(data), normalizePackageName(word))
}

function getUpdatedScore(index: MarketSearchIndex, now = Date.now()) {
  const timestamp = index.updatedTimestamp
  if (!Number.isFinite(timestamp)) return 0
  const days = Math.max(0, (now - timestamp) / 86400000)
  return Math.max(0, 1 - Math.log2(days + 1) / 16)
}

function getMarketRankScore(index: MarketSearchIndex, now = Date.now()) {
  return index.rating ?? getUpdatedScore(index, now)
}

function getSearchScoreByIndex(index: MarketSearchIndex, words: string[], now = Date.now()) {
  const rank = getMarketRankScore(index, now)
  if (!words.length) return rank
  let weight = 0
  for (const word of words) {
    const similarity = getSimilarityByIndex(index, word)
    if (!similarity) return 0
    weight += similarity
  }
  return rank * weight
}

function getSearchWords(words: string[]) {
  return normalizeFilterWords(words)
    .filter(w => w && !w.includes(':'))
    .map(normalizePackageName)
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function getDaysSince(timestamp: number, now: number) {
  if (!Number.isFinite(timestamp)) return Infinity
  return Math.max(0, (now - timestamp) / 86400000)
}

function sigmoid(value: number, center: number, steepness: number) {
  return 1 / (1 + Math.exp(-(value - center) * steepness))
}

function getFreshnessScore(days: number) {
  if (!Number.isFinite(days)) return 0
  if (days <= 30) return 1
  if (days <= 90) return 0.75
  if (days <= 180) return 0.45
  return Math.exp(-days / 720)
}

function hasPackageLink(data: SearchObject) {
  const links = data.package.links ?? {}
  return !!(links.repository || links.homepage || links.bugs)
}

function getQualityScore(data: SearchObject, index: MarketSearchIndex) {
  const manifestDescription = data.manifest?.description
  const hasManifestDescription = typeof manifestDescription === 'string'
    ? !!manifestDescription.trim()
    : !!Object.values(manifestDescription ?? {}).some(value => String(value ?? '').trim())
  const packageDescription = (data.package as SearchObject['package'] & { description?: string }).description
  const keywords = data.package.keywords ?? []
  const license = data.license || (data.package as SearchObject['package'] & { license?: string }).license
  let score = 0
  if (hasManifestDescription) score += 0.22
  if (packageDescription?.trim()) score += 0.18
  if (index.category && index.category !== 'other') score += 0.14
  if (keywords.length >= 3) score += 0.12
  if (data.package.maintainers?.length) score += 0.10
  if (license) score += 0.08
  if (!index.bundle) score += 0.08
  return clamp(score)
}

function getTrustScore(data: SearchObject) {
  let score = 0
  if (data.verified) score += 0.55
  if (data.portable) score += 0.15
  if (hasPackageLink(data)) score += 0.10
  return clamp(score)
}

function getExplorationScore(downloads: number, maintenance: number, quality: number) {
  const lowDownloadBoost = 1 - sigmoid(Math.log10(downloads + 1), 2.2, 1.25)
  const recentBoost = maintenance
  const qualityFloor = clamp((quality - 0.35) / 0.65)
  return clamp(lowDownloadBoost * recentBoost * qualityFloor)
}

function getRiskMultiplier(data: SearchObject) {
  if (data.insecure || data.manifest?.insecure) return 0.15
  if (data.deprecated || data.package.deprecated) return 0.25
  if (data.manifest?.preview === true) return 0.60
  return 1
}

function getRecommendScore(data: SearchObject, index: MarketSearchIndex, config: MarketConfig | undefined, now: number) {
  const downloads = Math.max(0, data.downloads?.lastMonth ?? 0)
  const updatedDays = getDaysSince(index.updatedTimestamp, now)
  const createdDays = getDaysSince(index.createdTimestamp, now)
  const popularity = sigmoid(Math.log10(downloads + 1), 2.6, 1.15)
  const maintenance = Number.isFinite(updatedDays) ? Math.exp(-updatedDays / 120) : 0
  const freshness = getFreshnessScore(createdDays)
  const trust = getTrustScore(data)
  const quality = getQualityScore(data, index)
  const exploration = getExplorationScore(downloads, maintenance, quality)
  let score = 100 * (
    0.30 * popularity
    + 0.24 * maintenance
    + 0.16 * freshness
    + 0.12 * trust
    + 0.10 * quality
    + 0.08 * exploration
  )
  score *= getRiskMultiplier(data)
  if (config?.installed?.(data)) score *= 0.18
  return score
}

function compareRecommendFallback(a: SearchObject, b: SearchObject) {
  const downloadDelta = (b.downloads?.lastMonth ?? 0) - (a.downloads?.lastMonth ?? 0)
  if (downloadDelta) return downloadDelta
  const updatedDelta = b.updatedAt.localeCompare(a.updatedAt)
  if (updatedDelta) return updatedDelta
  const createdDelta = b.createdAt.localeCompare(a.createdAt)
  if (createdDelta) return createdDelta
  return a.package.name.localeCompare(b.package.name)
}

export const comparators: Dict<Comparator> = {
  default: {
    icon: 'solid:all',
    compare: (a, b, words) => {
      const searchWords = getSearchWords(words)
      const now = Date.now()
      const delta = getSearchScoreByIndex(getSearchIndex(b), searchWords, now) - getSearchScoreByIndex(getSearchIndex(a), searchWords, now)
      return delta || b.updatedAt.localeCompare(a.updatedAt)
    },
  },
  recommend: {
    icon: 'award',
  },
  download: {
    icon: 'download',
    compare: (a, b) => (b.downloads?.lastMonth ?? 0) - (a.downloads?.lastMonth ?? 0),
  },
  created: {
    icon: 'heart-pulse',
    compare: (a, b) => b.createdAt.localeCompare(a.createdAt),
  },
  updated: {
    icon: 'tag',
    compare: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  },
}

export const categories = [
  'adapter',
  'general',
  'extension',
  'webui',
  'manage',
  'preset',
  'image',
  'media',
  'tool',
  'life',
  'ai',
  'meme',
  'game',
  'gametool',
]

export interface MarketConfig {
  installed?(data: SearchObject): boolean
  portable?: boolean
}

interface ValidateConfig extends MarketConfig {
  users?: User[]
  index?: MarketSearchIndex
}

export const kConfig = Symbol('market.config') as InjectionKey<MarketConfig>

export function getVisible(market: SearchObject[], words: string[]) {
  return market?.slice().filter((data) => {
    return (!data.manifest?.hidden || words.includes('show:hidden'))
      && (!data.deprecated || words.includes('show:deprecated'))
  })
}

function getSortConfig(words: string[]) {
  for (let word of words) {
    if (!word.startsWith('sort:')) continue
    let order = 1
    if (word.endsWith('-asc')) {
      order = -1
      word = word.slice(0, -4)
    } else if (word.endsWith('-desc')) {
      word = word.slice(0, -5)
    }
    const key = word.slice(5)
    if (comparators[key]) return { key, order }
  }
  return { key: 'default', order: 1 }
}

function sortRecommendMarket(market: SearchObject[], order: number, config?: MarketConfig) {
  const now = Date.now()
  return market
    .map(data => ({
      data,
      index: getSearchIndex(data),
    }))
    .map(item => ({
      ...item,
      score: getRecommendScore(item.data, item.index, config, now),
    }))
    .sort((a, b) => {
      const delta = b.score - a.score
      return (delta || compareRecommendFallback(a.data, b.data)) * order
    })
    .map(item => item.data)
}

function sortMarket(market: SearchObject[], words: string[], config?: MarketConfig) {
  const { key, order } = getSortConfig(words)
  if (key === 'recommend') return sortRecommendMarket(market, order, config)
  if (key !== 'default') {
    const comparator = comparators[key]
    return market.slice().sort((a, b) => comparator.compare!(a, b, words, config) * order)
  }
  const searchWords = getSearchWords(words)
  const now = Date.now()
  return market
    .map(data => ({
      data,
      index: getSearchIndex(data),
    }))
    .map(item => ({
      ...item,
      score: getSearchScoreByIndex(item.index, searchWords, now),
    }))
    .sort((a, b) => {
      const delta = b.score - a.score
      return (delta || b.index.updatedAt.localeCompare(a.index.updatedAt)) * order
    })
    .map(item => item.data)
}

export function getSorted(market: SearchObject[], words: string[], config?: MarketConfig) {
  return sortMarket(getVisible(market, words), words, config)
}

export function getSortedPrepared(market: SearchObject[], words: string[], config?: MarketConfig) {
  return sortMarket(market, words, config)
}

export function getSortedFiltered(market: SearchObject[], words: string[], config?: MarketConfig) {
  const visible = getVisible(market, words)
  const filtered = getFiltered(visible, words, config)
  return sortMarket(filtered, words, config)
}

export function getFiltered(market: SearchObject[], words: string[], config?: MarketConfig) {
  const filters = normalizeFilterWords(words)
  if (!filters.length) return market
  return market.filter((data) => {
    const index = getSearchIndex(data)
    return filters.every((word) => {
      return validate(data, word, { ...config, index, users: index.users })
    })
  })
}

export function getSilentFiltered(market: SearchObject[], words: string[], config?: MarketConfig) {
  const filters = normalizeFilterWords(words)
  if (!filters.length) return market
  return market.filter((data) => {
    const index = getSearchIndex(data)
    return !filters.some((word) => {
      return validate(data, word, { ...config, index, users: index.users })
    })
  })
}

export function parseSilentFilters(value?: string | string[]) {
  const source = Array.isArray(value) ? value : (value ?? '').split(/\n+/g)
  return normalizeFilterWords(source.flatMap(item => String(item).split(/[\s,，;；]+/g)))
}

function normalizeFilterWords(words: string[]) {
  return words.map(word => word.trim().toLowerCase()).filter(Boolean)
}

const modifiers = ['show:', 'sort:', 'limit:']

export function hasFilter(words: string[]) {
  return words.filter(w => w && modifiers.every(prefix => !w.startsWith(prefix))).length > 0
}

export function resolveCategory(name?: string) {
  if (categories.includes(name!)) return name
  return 'other'
}

const operators = ['is', 'not', 'created', 'updated', 'impl', 'locale', 'using', 'category', 'email', 'show', 'sort', 'limit']

export function validateWord(word: string) {
  if (!word.includes(':')) return true
  const [key] = word.split(':', 1)
  return operators.includes(key)
}

export function validate(data: SearchObject, word: string, config: ValidateConfig = {}) {
  const index = config.index ?? getSearchIndex(data)
  if (word.startsWith('updated:within:')) {
    return withinDays(index.updatedTimestamp, word.slice(15))
  } else if (word.startsWith('created:within:')) {
    return withinDays(index.createdTimestamp, word.slice(15))
  } else if (word.startsWith('updated:<=')) {
    return compareDate(index.updatedAt, index.updatedTimestamp, '<=', word.slice(10))
  } else if (word.startsWith('updated:>=')) {
    return compareDate(index.updatedAt, index.updatedTimestamp, '>=', word.slice(10))
  } else if (word.startsWith('updated:<')) {
    return compareDate(index.updatedAt, index.updatedTimestamp, '<', word.slice(9))
  } else if (word.startsWith('updated:>')) {
    return compareDate(index.updatedAt, index.updatedTimestamp, '>', word.slice(9))
  } else if (word.startsWith('created:<=')) {
    return compareDate(index.createdAt, index.createdTimestamp, '<=', word.slice(10))
  } else if (word.startsWith('created:>=')) {
    return compareDate(index.createdAt, index.createdTimestamp, '>=', word.slice(10))
  } else if (word.startsWith('created:<')) {
    return compareDate(index.createdAt, index.createdTimestamp, '<', word.slice(9))
  } else if (word.startsWith('created:>')) {
    return compareDate(index.createdAt, index.createdTimestamp, '>', word.slice(9))
  }

  if (data.manifest) {
    const { locales, service } = data.manifest
    if (word.startsWith('impl:')) {
      return service.implements.includes(word.slice(5))
    } else if (word.startsWith('locale:')) {
      return locales.includes(word.slice(7))
    } else if (word.startsWith('using:')) {
      const name = word.slice(6)
      return service.required.includes(name) || service.optional.includes(name)
    } else if (word.startsWith('category:')) {
      return index.category === word.slice(9)
    } else if (word.startsWith('email:')) {
      const users = config.users ?? getUsers(data)
      const target = word.slice(6)
      return users.some(({ email }) => email?.toLowerCase() === target)
    } else if (word.startsWith('is:')) {
      if (word === 'is:verified') return data.verified
      if (word === 'is:insecure') return data.insecure
      if (word === 'is:portable') return data.portable
      if (word === 'is:preview') return !!data.manifest.preview
      if (word === 'is:installed') return !!config.installed?.(data)
      if (word === 'is:bundle') return index.bundle
      return false
    } else if (word.startsWith('not:')) {
      if (word === 'not:verified') return !data.verified
      if (word === 'not:insecure') return !data.insecure
      if (word === 'not:portable') return !data.portable
      if (word === 'not:preview') return !data.manifest.preview
      if (word === 'not:installed') return !config.installed?.(data)
      if (word === 'not:bundle') return !index.bundle
      return true
    } else if (word.includes(':')) {
      return true
    }
  } else {
    if (word.startsWith('is:')) {
      if (word === 'is:installed') return !!config.installed?.(data)
      if (word === 'is:bundle') return index.bundle
      return false
    } else if (word.startsWith('not:')) {
      if (word === 'not:installed') return !config.installed?.(data)
      if (word === 'not:bundle') return !index.bundle
      return true
    } else if (word.includes(':')) {
      return true
    }
  }

  return getSimilarityByIndex(index, normalizePackageName(word)) > 0
}

function parseQueryDate(value: string, endOfDay = false) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
    return Date.parse(value + suffix)
  }
  return Date.parse(value)
}

function compareDate(value: string, timestamp: number, operator: '<' | '<=' | '>' | '>=', query: string) {
  const left = timestamp
  const right = parseQueryDate(query, operator === '<=' || operator === '>')
  if (Number.isFinite(left) && Number.isFinite(right)) {
    if (operator === '<') return left < right
    if (operator === '<=') return left <= right
    if (operator === '>') return left > right
    return left >= right
  }
  if (operator === '<') return value < query
  if (operator === '<=') return value <= query
  if (operator === '>') return value > query
  return value >= query
}

function withinDays(timestamp: number, query: string) {
  if (!/^\d{1,4}$/.test(query)) return true
  if (!Number.isFinite(timestamp)) return false
  const days = Number(query)
  return timestamp >= Date.now() - days * 86400000
}

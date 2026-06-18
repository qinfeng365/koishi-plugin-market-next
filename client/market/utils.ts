import { SearchObject, User } from '@koishijs/registry'
import { InjectionKey, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Dict } from 'cosmokit'
import zhCN from './locales/zh-CN.yml'
import * as md5 from 'spark-md5'
import { send } from '@koishijs/client'
import { hasBundleKeyword, isBundlePackageName } from '../../src/shared/bundle'

export const useMarketI18n = () => useI18n({
  messages: {
    'zh-CN': zhCN,
  },
})

export function getUsers(data: SearchObject) {
  const result: Record<string, User> = {}
  for (const user of data.package.contributors ?? []) {
    const key = getUserKey(user)
    if (!key) continue
    result[key] ||= user
  }
  if (!data.package.maintainers.some(user => result[getUserKey(user)])) {
    return data.package.maintainers.map(user => ({
      ...user,
      name: user.name || user.username,
    }))
  }
  return Object.values(result)
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
  compare(a: SearchObject, b: SearchObject, words: string[]): number
}

function normalizeSearchText(value: unknown) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
}

function normalizePackageName(name: string) {
  return normalizeSearchText(name).replace(/(koishi-|^@koishijs\/)plugin-/, '')
}

function getSearchTexts(data: SearchObject) {
  const description = data.manifest?.description
  const descriptions = typeof description === 'string'
    ? [description]
    : Object.values(description ?? {})
  return [
    ...(data.package.keywords ?? []),
    ...descriptions,
  ].map(normalizeSearchText)
}

function getSimilarity(data: SearchObject, word: string) {
  word = normalizePackageName(word)
  const shortname = normalizePackageName(data.package.name)
  if (shortname === word) return 1
  const tokens = shortname.split(/[-/_]/)
  // if (tokens[0] === word) return 0.5
  if (tokens.includes(word)) return 0.5
  // if (tokens[0].startsWith(word)) return 0.3
  if (tokens.some(t => t.startsWith(word))) return 0.3
  if (tokens.some(t => t.includes(word))) return 0.2
  return getSearchTexts(data).some(keyword => keyword.includes(word)) ? 0.05 : 0
}

function getUpdatedScore(data: SearchObject) {
  const timestamp = Date.parse(data.updatedAt)
  if (!Number.isFinite(timestamp)) return 0
  const days = Math.max(0, (Date.now() - timestamp) / 86400000)
  return Math.max(0, 1 - Math.log2(days + 1) / 16)
}

function getMarketRankScore(data: SearchObject) {
  const rating = Number((data as SearchObject & { rating?: number }).rating)
  return Number.isFinite(rating) ? rating : getUpdatedScore(data)
}

function getSearchScore(data: SearchObject, words: string[]) {
  words = words.filter(w => w && !w.includes(':'))
  const rank = getMarketRankScore(data)
  if (!words.length) return rank
  let weight = 0
  for (const word of words) {
    const similarity = getSimilarity(data, word)
    if (!similarity) return 0
    weight += similarity
  }
  return rank * weight
}

export const comparators: Dict<Comparator> = {
  default: {
    icon: 'solid:all',
    compare: (a, b, words) => {
      const delta = getSearchScore(b, words) - getSearchScore(a, words)
      return delta || b.updatedAt.localeCompare(a.updatedAt)
    },
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
  layout?: 'grid' | 'list'
}

interface ValidateConfig extends MarketConfig {
  users?: User[]
}

export const kConfig = Symbol('market.config') as InjectionKey<MarketConfig>

export function getVisible(market: SearchObject[], words: string[]) {
  return market?.slice().filter((data) => {
    return (!data.manifest?.hidden || words.includes('show:hidden'))
      && (!data.deprecated || words.includes('show:deprecated'))
  })
}

export function getSorted(market: SearchObject[], words: string[]) {
  return getVisible(market, words).sort((a, b) => {
    for (let word of words) {
      if (!word.startsWith('sort:')) continue
      let order = 1
      if (word.endsWith('-asc')) {
        order = -1
        word = word.slice(0, -4)
      } else if (word.endsWith('-desc')) {
        word = word.slice(0, -5)
      }
      const comparator = comparators[word.slice(5)]
      if (comparator) return comparator.compare(a, b, words) * order
    }
    return comparators.default.compare(a, b, words)
  })
}

export function getFiltered(market: SearchObject[], words: string[], config?: MarketConfig) {
  const filters = normalizeFilterWords(words)
  return market.filter((data) => {
    const users = getUsers(data)
    return filters.every((word) => {
      return validate(data, word, { ...config, users })
    })
  })
}

export function getSilentFiltered(market: SearchObject[], words: string[], config?: MarketConfig) {
  const filters = normalizeFilterWords(words)
  if (!filters.length) return market
  return market.filter((data) => {
    const users = getUsers(data)
    return !filters.some((word) => {
      return validate(data, word, { ...config, users })
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
  if (word.startsWith('updated:within:')) {
    return withinDays(data.updatedAt, word.slice(15))
  } else if (word.startsWith('created:within:')) {
    return withinDays(data.createdAt, word.slice(15))
  } else if (word.startsWith('updated:<=')) {
    return compareDate(data.updatedAt, '<=', word.slice(10))
  } else if (word.startsWith('updated:>=')) {
    return compareDate(data.updatedAt, '>=', word.slice(10))
  } else if (word.startsWith('updated:<')) {
    return compareDate(data.updatedAt, '<', word.slice(9))
  } else if (word.startsWith('updated:>')) {
    return compareDate(data.updatedAt, '>', word.slice(9))
  } else if (word.startsWith('created:<=')) {
    return compareDate(data.createdAt, '<=', word.slice(10))
  } else if (word.startsWith('created:>=')) {
    return compareDate(data.createdAt, '>=', word.slice(10))
  } else if (word.startsWith('created:<')) {
    return compareDate(data.createdAt, '<', word.slice(9))
  } else if (word.startsWith('created:>')) {
    return compareDate(data.createdAt, '>', word.slice(9))
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
      return resolveCategory(data.category) === word.slice(9)
    } else if (word.startsWith('email:')) {
      const users = config.users ?? getUsers(data)
      return users.some(({ email }) => email === word.slice(6))
    } else if (word.startsWith('is:')) {
      if (word === 'is:verified') return data.verified
      if (word === 'is:insecure') return data.insecure
      if (word === 'is:portable') return data.portable
      if (word === 'is:preview') return !!data.manifest.preview
      if (word === 'is:installed') return !!config.installed?.(data)
      if (word === 'is:bundle') return isBundleSearchObject(data)
      return false
    } else if (word.startsWith('not:')) {
      if (word === 'not:verified') return !data.verified
      if (word === 'not:insecure') return !data.insecure
      if (word === 'not:portable') return !data.portable
      if (word === 'not:preview') return !data.manifest.preview
      if (word === 'not:installed') return !config.installed?.(data)
      if (word === 'not:bundle') return !isBundleSearchObject(data)
      return true
    } else if (word.includes(':')) {
      return true
    }
  } else {
    if (word.startsWith('is:')) {
      if (word === 'is:installed') return !!config.installed?.(data)
      if (word === 'is:bundle') return isBundleSearchObject(data)
      return false
    } else if (word.startsWith('not:')) {
      if (word === 'not:installed') return !config.installed?.(data)
      if (word === 'not:bundle') return !isBundleSearchObject(data)
      return true
    } else if (word.includes(':')) {
      return true
    }
  }

  return getSimilarity(data, word) > 0
}

function parseQueryDate(value: string, endOfDay = false) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
    return Date.parse(value + suffix)
  }
  return Date.parse(value)
}

function compareDate(value: string, operator: '<' | '<=' | '>' | '>=', query: string) {
  const left = Date.parse(value)
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

function withinDays(value: string, query: string) {
  if (!/^\d{1,4}$/.test(query)) return true
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return false
  const days = Number(query)
  return timestamp >= Date.now() - days * 86400000
}

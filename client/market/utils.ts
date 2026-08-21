import { SearchObject, User } from '@koishijs/registry'
import { InjectionKey } from 'vue'
import { Dict } from 'cosmokit'
import { hasBundleKeyword, isBundlePackageName } from '../../src/shared/bundle'
import { useMarketNextI18n } from '../i18n'
import { getUsers } from './users'

export * from './avatar'
export { getUserKey, getUsers } from './users'

export function useMarketI18n() {
  const { t: baseT, locale } = useMarketNextI18n()
  const t = (key: string, ...args: any[]) => baseT(`market.${key}`, ...args)
  return { t, locale }
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

export function getSortedPrepared(market: SearchObject[], words: string[], config?: MarketConfig) {
  return sortMarket(market, words, config)
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

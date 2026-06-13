import { SearchObject, User } from '@koishijs/registry'
import { InjectionKey } from 'vue'
import { useI18n } from 'vue-i18n'
import { Dict } from 'cosmokit'
import zhCN from './locales/zh-CN.yml'
import * as md5 from 'spark-md5'
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

export function getUserAvatar(user: User, gravatar?: string) {
  const avatar = (user as User & { avatar?: string, url?: string }).avatar
  if (avatar) return avatar
  const url = (user as User & { avatar?: string, url?: string }).url
  if (url && /\.(?:png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(url)) return url
  return (gravatar || 'https://s.gravatar.com')
    + '/avatar/'
    + (user.email ? md5.hash(user.email.toLowerCase()) : '')
    + '.png?d=mp'
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

function getSimRating(data: SearchObject, words: string[]) {
  words = words.filter(w => w && !w.includes(':'))
  if (!words.length) return data.rating
  let weight = 0
  for (const word of words) {
    const similarity = getSimilarity(data, word)
    if (!similarity) return 0
    weight += similarity
  }
  return data.rating * weight
}

export const comparators: Dict<Comparator> = {
  default: {
    icon: 'solid:all',
    compare: (a, b, words) => getSimRating(b, words) - getSimRating(a, words),
  },
  rating: {
    icon: 'star-full',
    compare: (a, b) => b.rating - a.rating,
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
  return market.filter((data) => {
    const users = getUsers(data)
    return words.every((word) => {
      return validate(data, word, { ...config, users })
    })
  })
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
    } else if (word.startsWith('updated:<')) {
      return data.updatedAt < word.slice(9)
    } else if (word.startsWith('updated:>')) {
      return data.updatedAt >= word.slice(9)
    } else if (word.startsWith('created:<')) {
      return data.createdAt < word.slice(9)
    } else if (word.startsWith('created:>')) {
      return data.createdAt >= word.slice(9)
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

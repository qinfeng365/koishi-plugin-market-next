import { send } from '@koishijs/client'
import type { User } from '@koishijs/registry'
import * as md5 from 'spark-md5'
import { ref } from 'vue'
import { getUserKey } from './users'

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

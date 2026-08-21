import { Dict, Time } from 'koishi'
import type { SearchResult } from '@koishijs/registry'
import type { MarketPerformance, MarketPerformanceSnapshot } from '../shared'

export const FALLBACK_ENDPOINTS = [
  'https://registry.koishi.t4wefan.pub/index.json',
  'https://gitee.com/shangxueink/koishi-registry-aggregator/raw/gh-pages/market.json',
  'https://koi.nyan.zone/registry/index.json',
  'https://kp.itzdrli.cc',
  'https://koishi.itzdrli.cc',
  'https://registry.koishi.chat/index.json',
  'https://koishijs.github.io/registry/index.json',
  'https://raw.githubusercontent.com/koishijs/registry/release/index.json',
  'https://cdn.jsdelivr.net/gh/koishijs/registry@release/index.json',
  'https://ghproxy.net/https://raw.githubusercontent.com/koishijs/registry/release/index.json',
  'https://ghfast.top/https://raw.githubusercontent.com/koishijs/registry/release/index.json',
]

export const ROUTE_STAGGER = 80
export const FIRST_PAYLOAD_TIMEOUT = Time.second * 1.5
export const FAST_ROUTE_THRESHOLD = Time.second * 0.5
export const MAX_CACHE_ENTRIES = 3
export const CACHE_ENTRY_TTL = Time.day * 30
export const logLevels = ['silent', 'error', 'warn', 'info', 'debug'] as const

export type LogLevel = typeof logLevels[number]
export type MarketSource = NonNullable<MarketPerformance['source']>

export interface MarketProviderConfig {
  endpoint?: string
  timeout?: number
  proxyAgent?: string
  autoRoute?: boolean
  logLevel?: LogLevel
}

export interface CacheFile {
  endpoint: string
  fetchedAt: number
  validatedAt?: number
  etag?: string
  lastModified?: string
  hash?: string
  size?: number
  wireSize?: number
  contentEncoding?: string
  result: SearchResult
}

export interface CacheEntry extends Omit<CacheFile, 'result'> {
  result?: SearchResult
  file?: string
  objects?: number
}

export interface PersistedRouteStats {
  averageElapsed?: number
  lastSuccess?: number
  contentEncoding?: string
  score: number
  consecutiveFailures?: number
  cooldownUntil?: number
}

export interface CacheStore {
  version: 3
  entries: Dict<CacheEntry>
  lastUsed?: string
  routeStats?: Dict<PersistedRouteStats>
}

export type CacheMeta = Omit<CacheFile, 'result'>

export interface EndpointResult {
  endpoint: string
  preferredEndpoint?: string
  fallbackReason?: 'primary-failed' | 'primary-slow' | 'rescue'
  result: SearchResult
  elapsed: number
  candidates: number
  source: MarketSource
  timings: Dict<number>
  size?: number
  wireSize?: number
  contentEncoding?: string
  hash?: string
  etag?: string
  lastModified?: string
  cachedAt?: number
  validatedAt?: number
}

export interface RouteStats {
  score: number
  successes: number
  failures: number
  consecutiveFailures?: number
  cooldownUntil?: number
  averageElapsed?: number
  lastSuccess?: number
  contentEncoding?: string
}

export function formatError(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

export function formatStack(error: unknown) {
  if (error instanceof Error) return error.stack || error.message
  return String(error)
}

export function shortHash(hash?: string) {
  return hash?.slice(0, 12)
}

export function formatTime(value?: number) {
  if (!value) return '-'
  return new Date(value).toISOString()
}

export function formatAge(age?: number) {
  if (age == null || !Number.isFinite(age)) return '-'
  if (age < Time.second) return `${Math.max(0, Math.round(age))}ms`
  if (age < Time.minute) return `${Math.round(age / Time.second)}s`
  if (age < Time.hour) return `${Math.round(age / Time.minute)}m`
  if (age < Time.day) return `${Math.round(age / Time.hour)}h`
  return `${Math.round(age / Time.day)}d`
}

export function formatBytes(value?: number) {
  if (value == null || !Number.isFinite(value)) return '-'
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)}KB`
  return `${Math.round(value)}B`
}

export function parseContentLength(value?: string | null) {
  if (!value) return
  const size = Number(value)
  return Number.isFinite(size) && size > 0 ? size : undefined
}

export function normalizeWireSize(wireSize: number | undefined, decodedSize: number) {
  if (!wireSize && decodedSize > 0) return
  return wireSize
}

export function getRouteCooldown(failures = 0) {
  if (failures <= 0) return 0
  if (failures === 1) return Time.minute
  if (failures === 2) return Time.minute * 5
  if (failures === 3) return Time.minute * 30
  if (failures === 4) return Time.hour * 4
  return Time.hour * 12
}

export function formatSnapshot(snapshot: MarketPerformanceSnapshot = {}) {
  return [
    `source=${snapshot.source ?? 'unknown'}`,
    `endpoint=${snapshot.endpoint ?? 'unknown'}`,
    `preferred=${snapshot.preferredEndpoint ?? '-'}`,
    `fallback=${snapshot.fallbackReason ?? '-'}`,
    `candidates=${snapshot.candidates ?? '-'}`,
    `objects=${snapshot.objects ?? '-'}`,
    `size=${formatBytes(snapshot.size)}`,
    `wireSize=${formatBytes(snapshot.wireSize)}`,
    `encoding=${snapshot.contentEncoding ?? 'identity'}`,
    `cachedAt=${formatTime(snapshot.cachedAt)}`,
    `validatedAt=${formatTime(snapshot.validatedAt)}`,
    `timings=${formatTimings(snapshot.timings) || '-'}`,
  ].join(', ')
}

export function formatRouteScores(routes?: MarketPerformance['routeScores']) {
  if (!routes?.length) return '-'
  return routes.map(route => [
    route.endpoint,
    `score=${route.score}`,
    `ok=${route.successes ?? 0}`,
    `fail=${route.failures ?? 0}`,
    `consecutive=${route.consecutiveFailures ?? 0}`,
    `cooldown=${route.coolingDown ? formatTime(route.cooldownUntil) : '-'}`,
    `avg=${route.averageElapsed == null ? '-' : Math.round(route.averageElapsed) + 'ms'}`,
    `cache=${route.cached ? 'yes' : 'no'}`,
    `cachedAt=${formatTime(route.cachedAt)}`,
    `encoding=${route.contentEncoding ?? 'identity'}`,
  ].join(' ')).join(' | ')
}

export function formatCacheEntries(entries: Dict<CacheEntry>) {
  const values = Object.values(entries).filter((entry): entry is CacheEntry => !!entry)
  if (!values.length) return '-'
  return values.map(entry => [
    entry.endpoint,
    `objects=${entry.result?.objects?.length ?? entry.objects ?? '-'}`,
    `cachedAt=${formatTime(entry.fetchedAt)}`,
    `age=${formatAge(Date.now() - entry.fetchedAt)}`,
    `hash=${shortHash(entry.hash) ?? '-'}`,
    `size=${formatBytes(entry.size)}`,
    `wireSize=${formatBytes(entry.wireSize)}`,
    `encoding=${entry.contentEncoding ?? 'identity'}`,
  ].join(' ')).join(' | ')
}

export function normalizeCacheStore(value: any): CacheStore {
  if ((value?.version === 2 || value?.version === 3) && value.entries && typeof value.entries === 'object') {
    const entries: Dict<CacheEntry> = {}
    for (const endpoint in value.entries) {
      const entry = normalizeCacheEntry(value.entries[endpoint])
      if (entry) entries[entry.endpoint] = entry
    }
    const routeStats = normalizePersistedRouteStats(value.routeStats)
    return { version: 3, entries, lastUsed: value.lastUsed, routeStats }
  }
  if ((value?.version === 2 || value?.version === 3) && value.routeStats && typeof value.routeStats === 'object') {
    return {
      version: 3,
      entries: {},
      lastUsed: value.lastUsed,
      routeStats: normalizePersistedRouteStats(value.routeStats),
    }
  }
  const entry = normalizeCacheEntry(value)
  if (entry) {
    return {
      version: 3,
      entries: { [entry.endpoint]: entry },
      lastUsed: entry.endpoint,
    }
  }
  return { version: 3, entries: {} }
}

export function isLegacyInlineCacheStore(value: any) {
  if (!value || typeof value !== 'object') return false
  if (value.version !== 3) return true
  return Object.values(value.entries ?? {}).some((entry: any) => Array.isArray(entry?.result?.objects))
}

export function normalizePersistedRouteStats(value: any): Dict<PersistedRouteStats> | undefined {
  if (!value || typeof value !== 'object') return
  const result: Dict<PersistedRouteStats> = {}
  for (const endpoint in value) {
    const stats = value[endpoint]
    if (!stats || typeof stats !== 'object') continue
    const score = Number(stats.score)
    if (!Number.isFinite(score)) continue
    result[endpoint] = {
      score: clamp(score, -6, 3),
      averageElapsed: finiteNumber(stats.averageElapsed),
      lastSuccess: finiteNumber(stats.lastSuccess),
      contentEncoding: typeof stats.contentEncoding === 'string' ? stats.contentEncoding : undefined,
      consecutiveFailures: finiteNumber(stats.consecutiveFailures),
      cooldownUntil: finiteNumber(stats.cooldownUntil),
    }
  }
  return Object.keys(result).length ? result : undefined
}

function finiteNumber(value: any) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export function normalizeCacheEntry(value: any): CacheEntry | undefined {
  const fetchedAt = Number(value?.fetchedAt)
  if (typeof value?.endpoint !== 'string') return
  if (!Number.isFinite(fetchedAt)) return
  if (!hasCacheResultReference(value)) return
  return { ...value, fetchedAt }
}

export function hasCacheResultReference(value: any): value is CacheEntry {
  return Array.isArray(value?.result?.objects)
    || typeof value?.file === 'string'
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export async function waitFor(task: Promise<any>, timeout: number) {
  let timer: ReturnType<typeof setTimeout>
  try {
    return await Promise.race([
      task.then(() => true),
      new Promise<boolean>(resolve => {
        timer = setTimeout(() => resolve(false), timeout)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export function formatTimings(timings: Dict<number> = {}) {
  return Object.entries(timings)
    .map(([key, value]) => `${key}=${Math.round(value)}ms`)
    .join(', ')
}

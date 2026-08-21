import { Context, Dict, Time } from 'koishi'
import type { SearchResult } from '@koishijs/registry'
import { promises as fsp } from 'fs'
import { createHash } from 'crypto'
import { dirname, resolve } from 'path'
import {
  CACHE_ENTRY_TTL,
  MAX_CACHE_ENTRIES,
  formatAge,
  formatBytes,
  formatCacheEntries,
  formatError,
  formatTime,
  hasCacheResultReference,
  isLegacyInlineCacheStore,
  normalizeCacheStore,
  shortHash,
  type CacheEntry,
  type CacheFile,
  type CacheMeta,
  type CacheStore,
  type EndpointResult,
  type LogLevel,
  type MarketProviderConfig,
  type PersistedRouteStats,
} from './market-internals'

interface MarketDiskCacheOptions {
  getEndpointCandidates: () => string[]
  getRouteScore: (endpoint: string) => number
  getRouteStats: () => Dict<PersistedRouteStats>
  restoreRouteStats: (stats: Dict<PersistedRouteStats>) => void
  isStale: (serial: number) => boolean
  isActive: () => boolean
  log: (level: Exclude<LogLevel, 'silent'>, message: string) => void
}

export interface LoadedMarketDiskCache {
  entry: CacheFile
  readElapsed: number
  parseElapsed: number
  start: number
}

export class MarketDiskCache {
  readonly file: string
  readonly directory: string
  entries: Dict<CacheEntry> = {}

  private loadedMeta?: CacheMeta
  private conditionMeta?: CacheMeta
  private result?: SearchResult
  private writeTimer?: ReturnType<typeof setTimeout>
  private routeStatsWriteTimer?: ReturnType<typeof setTimeout>
  private maintenanceTimers = new Set<ReturnType<typeof setTimeout>>()

  constructor(
    private ctx: Context,
    private config: MarketProviderConfig,
    private options: MarketDiskCacheOptions,
  ) {
    this.file = resolve(ctx.baseDir, 'cache', 'market-next-index.json')
    this.directory = resolve(ctx.baseDir, 'cache', 'market-next-index')
  }

  get diskMeta() {
    return this.loadedMeta
  }

  get currentMeta() {
    return this.conditionMeta
  }

  get currentResult() {
    return this.result
  }

  dispose() {
    clearTimeout(this.writeTimer)
    clearTimeout(this.routeStatsWriteTimer)
    for (const timer of this.maintenanceTimers) clearTimeout(timer)
    this.maintenanceTimers.clear()
  }

  clearDiskMeta() {
    this.loadedMeta = undefined
  }

  getConditionalHeaders(endpoint: string) {
    const meta = this.entries[endpoint]
      || (this.conditionMeta?.endpoint === endpoint ? this.conditionMeta : undefined)
    if (!meta) return {}
    const headers: Dict<string> = {}
    if (meta.etag) headers['if-none-match'] = meta.etag
    if (meta.lastModified) headers['if-modified-since'] = meta.lastModified
    return headers
  }

  updateFromEndpoint(result: EndpointResult) {
    const cached = this.entries[result.endpoint]
    const sameEndpoint = this.conditionMeta?.endpoint === result.endpoint
    this.result = result.result
    this.conditionMeta = {
      endpoint: result.endpoint,
      fetchedAt: result.source === 'network'
        ? Date.now()
        : result.cachedAt ?? cached?.fetchedAt ?? this.conditionMeta?.fetchedAt ?? Date.now(),
      validatedAt: result.validatedAt,
      etag: result.etag ?? (sameEndpoint ? this.conditionMeta?.etag : undefined),
      lastModified: result.lastModified ?? (sameEndpoint ? this.conditionMeta?.lastModified : undefined),
      hash: result.hash ?? this.conditionMeta?.hash,
      size: result.size ?? this.conditionMeta?.size,
      wireSize: result.wireSize ?? this.conditionMeta?.wireSize,
      contentEncoding: result.contentEncoding ?? this.conditionMeta?.contentEncoding,
    }
    this.entries[result.endpoint] = {
      ...this.conditionMeta,
      result: result.result,
    }
  }

  async load(serial: number): Promise<LoadedMarketDiskCache | undefined> {
    const start = Date.now()
    try {
      const endpoints = this.options.getEndpointCandidates()
      this.options.log('debug', `read market disk cache: file=${this.file}, preferred=${this.config.endpoint}, candidates=${endpoints.join(', ')}`)
      const readStart = Date.now()
      const content = await fsp.readFile(this.file, 'utf8')
      const readElapsed = Date.now() - readStart
      const parseStart = Date.now()
      const rawStore = JSON.parse(content)
      const shouldMigrate = isLegacyInlineCacheStore(rawStore)
      const store = normalizeCacheStore(rawStore)
      const parseElapsed = Date.now() - parseStart
      this.entries = { ...this.entries, ...store.entries }
      if (store.routeStats) {
        this.options.restoreRouteStats(store.routeStats)
        this.options.log('debug', `market route stats restored from disk: ${Object.keys(store.routeStats).join(', ')}`)
      }
      this.options.log('debug', `market disk cache store parsed: bytes=${formatBytes(Buffer.byteLength(content))}, entries=${Object.keys(store.entries).length}, lastUsed=${store.lastUsed ?? '-'}, parse=${parseElapsed}ms, endpoints=${formatCacheEntries(store.entries)}`)

      const staleEndpoints = Object.values(store.entries)
        .filter((entry): entry is CacheEntry => !!entry && Date.now() - entry.fetchedAt > CACHE_ENTRY_TTL)
        .map(entry => entry.endpoint)
      if (staleEndpoints.length) {
        this.options.log('debug', `market disk cache has ${staleEndpoints.length} stale entries (>${CACHE_ENTRY_TTL / Time.day}d), will prune on next write: ${staleEndpoints.join(', ')}`)
      }

      const entry = await this.pick()
      if (!entry) {
        this.options.log('debug', `skip market disk cache because no cached endpoint matches candidates: ${Object.keys(store.entries).join(', ')}`)
        return
      }
      if (this.options.isStale(serial)) return

      if (staleEndpoints.length) {
        this.writeTimer ??= setTimeout(() => {
          this.writeTimer = undefined
          if (!this.conditionMeta) return
          void this.writeStore({
            version: 3,
            entries: this.pruneEntries(this.conditionMeta.endpoint),
            lastUsed: this.conditionMeta.endpoint,
            routeStats: this.options.getRouteStats(),
          })
        }, 5000)
      }
      if (shouldMigrate) {
        this.options.log('debug', 'schedule market disk cache migration to split v3 layout')
        this.scheduleMaintenance(1000, () => {
          void this.writeStore({
            version: 3,
            entries: this.pruneEntries(entry.endpoint),
            lastUsed: entry.endpoint,
            routeStats: this.options.getRouteStats(),
          })
        })
      }
      return { entry, readElapsed, parseElapsed, start }
    } catch (error) {
      if ((error as any)?.code !== 'ENOENT') {
        this.options.log('warn', `failed to read market disk cache: ${formatError(error)}`)
      } else {
        this.options.log('debug', 'market disk cache is empty')
      }
    }
  }

  async loadEntry(entry: CacheEntry): Promise<CacheFile | undefined> {
    if (Array.isArray(entry.result?.objects)) return entry as CacheFile
    if (!entry.file) return
    try {
      const content = await fsp.readFile(resolve(this.directory, entry.file), 'utf8')
      const result = JSON.parse(content) as SearchResult
      if (!Array.isArray(result?.objects)) return
      const cache: CacheFile = { ...entry, result }
      this.entries[entry.endpoint] = cache
      return cache
    } catch (error) {
      this.options.log('debug', `failed to read market split cache entry: endpoint=${entry.endpoint}, file=${entry.file}, error=${formatError(error)}`)
    }
  }

  scheduleWrite(result: SearchResult, meta = this.conditionMeta) {
    if (!meta) return
    clearTimeout(this.writeTimer)
    const entry: CacheFile = {
      ...meta,
      endpoint: meta.endpoint,
      fetchedAt: meta.fetchedAt,
      result,
    }
    this.entries[entry.endpoint] = entry
    const cache: CacheStore = {
      version: 3,
      entries: this.pruneEntries(entry.endpoint),
      lastUsed: entry.endpoint,
      routeStats: this.options.getRouteStats(),
    }
    this.entries = cache.entries
    this.options.log('debug', `schedule market disk cache write: endpoint=${entry.endpoint}, objects=${result.objects.length}, entries=${Object.keys(cache.entries).length}, file=${this.file}, hash=${shortHash(entry.hash) ?? '-'}, size=${formatBytes(entry.size)}, wireSize=${formatBytes(entry.wireSize)}, encoding=${entry.contentEncoding ?? 'identity'}`)
    this.writeTimer = setTimeout(() => {
      this.writeTimer = undefined
      void this.writeStore(cache)
    }, 0)
  }

  scheduleRouteStatsWrite() {
    clearTimeout(this.routeStatsWriteTimer)
    this.routeStatsWriteTimer = setTimeout(() => {
      this.routeStatsWriteTimer = undefined
      if (!this.options.isActive()) return
      void this.writeRouteStats()
    }, 1000)
  }

  activate(entry: CacheFile) {
    const meta: CacheMeta = {
      endpoint: entry.endpoint,
      fetchedAt: entry.fetchedAt,
      validatedAt: entry.validatedAt,
      etag: entry.etag,
      lastModified: entry.lastModified,
      hash: entry.hash,
      size: entry.size,
      wireSize: entry.wireSize,
      contentEncoding: entry.contentEncoding,
    }
    this.loadedMeta = this.conditionMeta = meta
    this.result = entry.result
    this.entries[entry.endpoint] = entry
  }

  private async pick() {
    const endpoints = this.options.getEndpointCandidates()
    const primary = this.entries[this.config.endpoint!]
    this.options.log('debug', `pick market disk cache: preferred=${this.config.endpoint}, endpointCandidates=${endpoints.join(', ')}, cachedEntries=${formatCacheEntries(this.entries)}`)
    const primaryCache = primary ? await this.loadEntry(primary) : undefined
    if (primaryCache) {
      this.options.log('debug', `pick market disk cache primary hit: endpoint=${primaryCache.endpoint}, score=${this.getScore(primaryCache).toFixed(2)}, cachedAt=${formatTime(primaryCache.fetchedAt)}, objects=${primaryCache.result.objects.length}`)
      return primaryCache
    }
    const candidates = endpoints
      .filter(endpoint => endpoint !== this.config.endpoint)
      .map(endpoint => this.entries[endpoint])
      .filter((cache): cache is CacheEntry => !!cache && hasCacheResultReference(cache))
      .sort((a, b) => {
        const delta = this.getScore(b) - this.getScore(a)
        if (delta) return delta
        return b.fetchedAt - a.fetchedAt
      })
    for (const entry of candidates) {
      const cache = await this.loadEntry(entry)
      if (!cache) continue
      this.options.log('debug', `pick market disk cache fallback hit: endpoint=${cache.endpoint}, candidates=${candidates.map(item => `${item.endpoint} score=${this.getScore(item).toFixed(2)} age=${formatAge(Date.now() - item.fetchedAt)} objects=${item.result?.objects?.length ?? item.objects ?? '-'}`).join(' | ')}`)
      return cache
    }
  }

  private getScore(cache: CacheEntry) {
    const age = Number.isFinite(cache.fetchedAt) ? Date.now() - cache.fetchedAt : Infinity
    let score = this.options.getRouteScore(cache.endpoint)
    if (age <= Time.hour * 12) score += 3
    else if (age <= Time.day * 3) score += 1
    else score -= 1
    if (cache.endpoint === this.config.endpoint) score += 0.5
    return score
  }

  private getEntryFilename(endpoint: string) {
    return `${createHash('sha1').update(endpoint).digest('hex').slice(0, 16)}.json`
  }

  private createSplitEntry(entry: CacheFile): CacheEntry {
    const { result, ...meta } = entry
    return {
      ...meta,
      file: this.getEntryFilename(entry.endpoint),
      objects: result.objects.length,
    }
  }

  private async writeEntryFile(entry: CacheFile) {
    await fsp.mkdir(this.directory, { recursive: true })
    const file = resolve(this.directory, this.getEntryFilename(entry.endpoint))
    const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`
    await fsp.writeFile(tempFile, JSON.stringify(entry.result))
    await fsp.rename(tempFile, file)
  }

  private async pruneSplitFiles(entries: Dict<CacheEntry>) {
    try {
      const keep = new Set(Object.values(entries).map(entry => entry?.file).filter(Boolean))
      const files = await fsp.readdir(this.directory).catch(() => [])
      await Promise.all(files
        .filter(file => file.endsWith('.json') && !keep.has(file))
        .map(file => fsp.unlink(resolve(this.directory, file)).catch(() => {})))
    } catch (error) {
      this.options.log('debug', `failed to prune split market cache files: ${formatError(error)}`)
    }
  }

  private async writeRouteStats() {
    const lastUsed = this.conditionMeta?.endpoint ?? this.config.endpoint!
    let entries = this.pruneEntries(lastUsed)
    let storeLastUsed = lastUsed
    if (!Object.keys(entries).length) {
      try {
        const content = await fsp.readFile(this.file, 'utf8')
        const store = normalizeCacheStore(JSON.parse(content))
        entries = store.entries
        storeLastUsed = store.lastUsed ?? lastUsed
        this.entries = { ...store.entries, ...this.entries }
      } catch (error) {
        if ((error as any)?.code !== 'ENOENT') {
          this.options.log('debug', `failed to merge market cache before route stats write: ${formatError(error)}`)
        }
      }
    }
    await this.writeStore({
      version: 3,
      entries,
      lastUsed: storeLastUsed,
      routeStats: this.options.getRouteStats(),
    })
  }

  private pruneEntries(lastUsed: string) {
    const entries = Object.values(this.entries)
      .filter((cache): cache is CacheEntry => !!cache
        && hasCacheResultReference(cache)
        && Date.now() - cache.fetchedAt <= CACHE_ENTRY_TTL)
      .sort((a, b) => {
        if (a.endpoint === lastUsed) return -1
        if (b.endpoint === lastUsed) return 1
        if (a.endpoint === this.config.endpoint) return -1
        if (b.endpoint === this.config.endpoint) return 1
        const delta = this.getScore(b) - this.getScore(a)
        if (delta) return delta
        return b.fetchedAt - a.fetchedAt
      })
      .slice(0, MAX_CACHE_ENTRIES)
    this.options.log('debug', `prune market disk cache entries: lastUsed=${lastUsed}, kept=${entries.map(entry => `${entry.endpoint} score=${this.getScore(entry).toFixed(2)} age=${formatAge(Date.now() - entry.fetchedAt)} objects=${entry.result?.objects?.length ?? entry.objects ?? '-'}`).join(' | ')}`)
    return Object.fromEntries(entries.map(entry => [entry.endpoint, entry]))
  }

  private async writeStore(cache: CacheStore) {
    if (!this.options.isActive()) return
    try {
      await fsp.mkdir(dirname(this.file), { recursive: true })
      const entries: Dict<CacheEntry> = {}
      for (const [endpoint, entry] of Object.entries(cache.entries)) {
        if (!entry) continue
        if (Array.isArray(entry.result?.objects)) {
          await this.writeEntryFile(entry as CacheFile)
          entries[endpoint] = this.createSplitEntry(entry as CacheFile)
        } else if (entry.file) {
          entries[endpoint] = entry
        }
      }
      const nextStore = JSON.stringify({
        ...cache,
        version: 3,
        entries,
      })
      const tempFile = `${this.file}.${process.pid}.${Date.now()}.tmp`
      await fsp.writeFile(tempFile, nextStore)
      await fsp.rename(tempFile, this.file)
      await this.pruneSplitFiles(entries)
      const endpoints = Object.keys(cache.entries)
      this.options.log('debug', `wrote market disk cache store: entries=${endpoints.length}, lastUsed=${cache.lastUsed ?? 'unknown'}, endpoints=${endpoints.join(', ')}`)
    } catch (error) {
      this.options.log('warn', `failed to write market disk cache: ${formatError(error)}`)
    }
  }

  private scheduleMaintenance(delay: number, callback: () => void) {
    const timer = setTimeout(() => {
      this.maintenanceTimers.delete(timer)
      if (this.options.isActive()) callback()
    }, delay)
    this.maintenanceTimers.add(timer)
  }
}

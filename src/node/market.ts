import { Context, Dict, HTTP, Schema, Time } from 'koishi'
import Scanner, { SearchObject, SearchResult } from '@koishijs/registry'
import { MarketPerformance, MarketPerformanceSnapshot, MarketProvider as BaseMarketProvider } from '../shared'
import { promises as fsp } from 'fs'
import { dirname, resolve } from 'path'
import { createHash } from 'crypto'

export const DEFAULT_ENDPOINT = 'https://registry.koishi.t4wefan.pub/index.json'
const FALLBACK_ENDPOINTS = [
  'https://registry.koishi.t4wefan.pub/index.json',
  'https://gitee.com/shangxueink/koishi-registry-aggregator/raw/gh-pages/market.json',
  'https://koi.nyan.zone/registry/index.json',
  'https://kp.itzdrli.cc',
  'https://koishi.itzdrli.cc',
  'https://registry.koishi.chat/index.json',
]
const ROUTE_STAGGER = 80
const FIRST_PAYLOAD_TIMEOUT = Time.second * 1.5
const FAST_ROUTE_THRESHOLD = Time.second * 0.5
const MAX_CACHE_ENTRIES = 3
const CACHE_ENTRY_TTL = Time.day * 30
const logLevels = ['silent', 'error', 'warn', 'info', 'debug'] as const

type LogLevel = typeof logLevels[number]
type MarketSource = NonNullable<MarketPerformance['source']>

interface CacheFile {
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

interface CacheEntry extends Omit<CacheFile, 'result'> {
  result?: SearchResult
  file?: string
  objects?: number
}

interface PersistedRouteStats {
  averageElapsed?: number
  lastSuccess?: number
  contentEncoding?: string
  score: number
  consecutiveFailures?: number
  cooldownUntil?: number
}

interface CacheStore {
  version: 3
  entries: Dict<CacheEntry>
  lastUsed?: string
  routeStats?: Dict<PersistedRouteStats>
}

type CacheMeta = Omit<CacheFile, 'result'>

interface EndpointResult {
  endpoint: string
  preferredEndpoint?: string
  fallbackReason?: 'primary-failed' | 'primary-slow'
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

interface RouteStats {
  score: number
  successes: number
  failures: number
  consecutiveFailures?: number
  cooldownUntil?: number
  averageElapsed?: number
  lastSuccess?: number
  contentEncoding?: string
}

class MarketProvider extends BaseMarketProvider {
  private http: HTTP
  private failed: string[] = []
  private scanner: Scanner
  private fullCache: Dict<SearchObject> = {}
  private tempCache: Dict<SearchObject> = {}
  private payload?: BaseMarketProvider.Payload
  private endpoint: string
  private disposed = false
  private serial = 0
  private forceRefresh = false
  private indexMode: 'modern' | 'legacy' = 'modern'
  private cacheFile: string
  private cacheDir: string
  private cacheEntries: Dict<CacheEntry> = {}
  private cacheMeta?: CacheMeta
  private conditionMeta?: CacheMeta
  private cacheResult?: SearchResult
  private debugInfo?: MarketPerformance
  private routeStats: Dict<RouteStats> = {}
  private backgroundTask?: Promise<void>
  private backgroundSerial?: number
  private pendingRefreshTask?: Promise<any>
  private cacheWriteTimer?: ReturnType<typeof setTimeout>
  private routeStatsWriteTimer?: ReturnType<typeof setTimeout>
  private warmDiskCacheTask?: Promise<boolean>
  private pendingControllers = new Set<AbortController>()
  private flushData: () => void

  constructor(ctx: Context, public config: MarketProvider.Config = {}) {
    super(ctx)
    ctx.effect(() => () => {
      this.disposed = true
      this.serial++
      clearTimeout(this.cacheWriteTimer)
      clearTimeout(this.routeStatsWriteTimer)
      this.abortPendingRequests('market provider disposed')
    })
    config.endpoint ||= DEFAULT_ENDPOINT
    this.endpoint = config.endpoint
    this.cacheFile = resolve(ctx.baseDir, 'cache', 'market-next-index.json')
    this.cacheDir = resolve(ctx.baseDir, 'cache', 'market-next-index')
    this.http = ctx.http.extend(config)
    this.flushData = ctx.throttle(() => {
      if (this.disposed || !this.scanner || !ctx.scope.isActive) return
      this.log('debug', `broadcast market patch: delta=${Object.keys(this.tempCache).length}, total=${this.scanner.total}, progress=${this.scanner.progress}, failed=${this.failed.length}`)
      ctx.console.broadcast('market/patch', {
        data: this.tempCache,
        failed: this.failed.length,
        total: this.scanner.total,
        progress: this.scanner.progress,
        stale: false,
        error: undefined,
        cached: false,
        cachedAt: undefined,
        validatedAt: undefined,
        refreshing: false,
        debug: this.getDebugInfo(),
      })
      this.tempCache = {}
    }, 500)
    ctx.on('ready', () => {
      void this.warmDiskCache('startup')
    })
  }

  async start(refresh = false) {
    const reuseBackground = refresh && !!this.backgroundTask && this.backgroundSerial === this.serial
    const serial = reuseBackground ? this.serial : ++this.serial
    if (!reuseBackground) this.abortPendingRequests('market refresh superseded')
    const start = Date.now()
    this.log('debug', `start market refresh=${refresh}, serial=${serial}, endpoint=${this.config.endpoint}, timeout=${this.config.timeout ?? 'default'}, autoRoute=${this.config.autoRoute !== false}`)
    if (refresh) {
      this.log('info', `market refresh requested: endpoint=${this.config.endpoint}, autoRoute=${this.config.autoRoute !== false}, cache=${this.hasCurrentMarketData() ? 'warm' : 'cold'}`)
      this.clearRouteCooldowns('manual refresh')
    }
    this.forceRefresh = false
    if (refresh && await this.startSoftRefresh(serial, start)) {
      if (this.isStale(serial)) {
        this.log('debug', `skip soft market refresh because provider is stale, serial=${serial}`)
        return
      }
      this.log('debug', `market soft refresh accepted in ${Date.now() - start}ms, serial=${serial}`)
      return
    }
    this.failed = []
    this.fullCache = {}
    this.tempCache = {}
    this.debugInfo = undefined
    if (refresh) {
      this._task = null
      this._error = null
      this.log('debug', 'soft refresh has no usable cache: start cold market load')
    }
    try {
      await super.start(false)
    } finally {
      this.forceRefresh = false
    }
    if (this.isStale(serial)) {
      this.log('debug', `skip market refresh result because provider is stale, serial=${serial}`)
      return
    }
    this.log('debug', `market start completed in ${Date.now() - start}ms, serial=${serial}`)
    this.log('info', `market start completed: elapsed=${Date.now() - start}ms, endpoint=${this.endpoint || this.config.endpoint}, objects=${this.scanner?.total ?? 0}, source=${this.debugInfo?.source ?? 'unknown'}`)
  }

  async collect() {
    const serial = this.serial
    const { timeout } = this.config
    const registry = this.createScanner()
    const start = Date.now()

    this.failed = []
    this.log('debug', `collect market index, serial=${serial}, searchEndpoint=${this.config.endpoint}, registryEndpoint=${registry?.config.endpoint}, timeout=${timeout ?? 'default'}`)
    if (this.http) {
      if (!this.forceRefresh && await this.applyDiskCache(serial)) {
        if (this.refreshInBackground(serial, 'cache-first')) void this.notifyMarketRefresh()
        this.log('debug', `collect market index returned disk cache first, serial=${serial}, elapsed=${Date.now() - start}ms`)
        return null
      }
      const result = await this.fetchIndex(serial)
      if (this.isStale(serial)) {
        this.log('debug', `drop fetched market index because provider is stale, serial=${serial}`)
        return null
      }
      const applyStart = Date.now()
      this.applyIndex(result.result, result.endpoint)
      result.timings.apply = Date.now() - applyStart
      result.timings.total = Date.now() - start
      this.updateCacheState(result)
      if (result.source !== 'disk-cache') this.scheduleDiskCacheWrite(result.result, this.conditionMeta)
      this.cacheMeta = undefined
      this.updateDebugInfo({
        source: result.source,
        endpoint: result.endpoint,
        preferredEndpoint: result.preferredEndpoint,
        fallbackReason: result.fallbackReason,
        candidates: result.candidates,
        size: result.size,
        wireSize: result.wireSize,
        contentEncoding: result.contentEncoding,
        objects: this.scanner.total,
        hash: shortHash(result.hash),
        etag: result.etag,
        lastModified: result.lastModified,
        cachedAt: result.cachedAt,
        validatedAt: result.validatedAt,
        timings: result.timings,
      }, 'initial')
      this.log('debug', `loaded market index from ${this.endpoint}: ${this.scanner.total}/${result.result.objects.length} objects, source=${result.source}, version=${this.scanner.version ?? 'legacy'}, elapsed=${Date.now() - start}ms`)
      this.log('info', `market index ready: ${formatSnapshot({
        source: result.source,
        endpoint: result.endpoint,
        preferredEndpoint: result.preferredEndpoint,
        fallbackReason: result.fallbackReason,
        candidates: result.candidates,
        objects: this.scanner.total,
        size: result.size,
        wireSize: result.wireSize,
        contentEncoding: result.contentEncoding,
        cachedAt: result.cachedAt,
        validatedAt: result.validatedAt,
        timings: result.timings,
      })}`)
    } else {
      this.indexMode = 'legacy'
      this.log('debug', `collect legacy registry index via scanner, registryEndpoint=${registry?.config.endpoint}`)
      await this.scanner.collect({ timeout })
      this.log('debug', `legacy scanner collect completed: total=${this.scanner.total}, version=${this.scanner.version ?? 'legacy'}, elapsed=${Date.now() - start}ms`)
    }

    if (!this.scanner.version) {
      const analyzeStart = Date.now()
      this.log('debug', `analyze legacy market packages, total=${this.scanner.total}`)
      this.scanner.analyze({
        version: '4',
        onFailure: (name, reason) => {
          this.failed.push(name)
          this.log('debug', `failed to analyze package ${name}: ${formatError(reason)}`)
          if (registry.config.endpoint.startsWith('https://registry.npmmirror.com')) {
            if (this.ctx.http.isError(reason) && reason.response?.status === 404) {
              // ignore 404 error for npmmirror
            }
          }
        },
        onRegistry: (registry, versions) => {
          this.log('debug', `loaded registry metadata for ${registry.name}: ${versions.length} versions`)
          this.ctx.installer.setPackage(registry.name, versions)
        },
        onSuccess: (object, versions) => {
          // npmmirror lacks `links` field
          object.package.links ||= {
            npm: `${registry.config.endpoint.replace('registry.', 'www.')}/package/${object.package.name}`,
          }
          this.fullCache[object.package.name] = this.tempCache[object.package.name] = object
        },
        after: () => this.flushData(),
      })
      this.log('debug', `legacy analyze completed: success=${Object.keys(this.fullCache).length}, failed=${this.failed.length}, elapsed=${Date.now() - analyzeStart}ms`)
    }

    if (this.indexMode === 'legacy') {
      this.updateDebugInfo({
        source: 'legacy',
        endpoint: registry?.config.endpoint,
        objects: Object.keys(this.fullCache).length,
        timings: { total: Date.now() - start },
      })
    }
    this.log('debug', `collect market index completed, serial=${serial}, elapsed=${Date.now() - start}ms`)
    return null
  }

  private createScanner() {
    const registry = this.ctx.installer.http
    this.scanner = new Scanner(<T>(url: string, config?: { timeout?: number }) => registry.get<T>(url, config))
    return registry
  }

  private hasCurrentMarketData() {
    return !!this.payload || !!this.scanner?.version || this.scanner?.total > 0 || Object.keys(this.fullCache).length > 0
  }

  private async startSoftRefresh(serial: number, start: number) {
    if (!this.http) return false
    this._error = null
    this.tempCache = {}
    if (this.backgroundTask && this.backgroundSerial === serial) {
      this.log('debug', `soft refresh reused running background task, serial=${serial}, elapsed=${Date.now() - start}ms`)
      this.log('info', `market soft refresh reused running background task: serial=${serial}, elapsed=${Date.now() - start}ms`)
      await this.notifyMarketRefresh()
      return true
    }
    if (this.hasCurrentMarketData()) {
      if (!this.scanner) this.createScanner()
      this.log('debug', `soft refresh started with current market data, serial=${serial}, hasScanner=${!!this.scanner}, hasPayload=${!!this.payload}`)
      this.log('info', `market soft refresh started with current data: serial=${serial}, endpoint=${this.endpoint || this.config.endpoint}, objects=${this.scanner?.total ?? this.payload?.total ?? 0}`)
      this.refreshInBackground(serial, 'soft refresh')
      await this.notifyMarketRefresh()
      return true
    }
    this.failed = []
    this.fullCache = {}
    this.createScanner()
    if (await this.applyDiskCache(serial)) {
      this.log('debug', `soft refresh loaded disk cache before background refresh, serial=${serial}, elapsed=${Date.now() - start}ms`)
      this.log('info', `market soft refresh loaded disk cache first: serial=${serial}, elapsed=${Date.now() - start}ms, endpoint=${this.endpoint}`)
      this.refreshInBackground(serial, 'soft refresh')
      await this.notifyMarketRefresh()
      return true
    }
    return false
  }

  private async fetchIndex(serial: number): Promise<EndpointResult> {
    const endpoints = this.getEndpoints()
    this.log('debug', `market endpoint candidates: ${endpoints.join(', ')}`)
    this.log('debug', `market route scores before fetch: ${formatRouteScores(this.getRouteScores(endpoints))}`)
    this.log('info', `market endpoint candidates: primary=${endpoints[0]}, fallbacks=${Math.max(0, endpoints.length - 1)}, autoRoute=${this.config.autoRoute !== false}`)

    if (endpoints.length === 1 || this.config.autoRoute === false) {
      const controller = this.trackController(new AbortController())
      try {
        const result = await this.fetchEndpoint(endpoints[0], 0, endpoints.length, serial, true, controller.signal)
        const { endpoint } = result
        this.endpoint = endpoint
        result.preferredEndpoint = endpoints[0]
        this.recordRouteSuccess(result)
        return result
      } catch (error) {
        if (!this.isStale(serial) && !this.isInternalAbort(error)) this.recordRouteFailure(endpoints[0])
        throw error
      } finally {
        this.untrackControllers([controller])
      }
    }

    this.log('debug', `fetch primary market endpoint first, primary=${endpoints[0]}, fallbacks=${endpoints.slice(1).join(', ')}, slowThreshold=${FAST_ROUTE_THRESHOLD}ms`)
    this.log('info', `market route started: primary=${endpoints[0]}, fallbackCount=${endpoints.length - 1}, slowThreshold=${FAST_ROUTE_THRESHOLD}ms`)
    return new Promise<EndpointResult>((resolve, reject) => {
      let settled = false
      let failed = 0
      let lastError: any
      let fallbackStarted = false
      let fallbackReason: EndpointResult['fallbackReason']
      const controllers = endpoints.map(() => this.trackController(new AbortController()))
      const timer = setTimeout(() => startFallback('primary-slow'), FAST_ROUTE_THRESHOLD)

      const finish = () => {
        clearTimeout(timer)
        this.untrackControllers(controllers)
      }

      const settle = (data: EndpointResult, index: number) => {
        if (settled) {
          this.log('debug', `ignore slower market endpoint ${data.endpoint}, elapsed=${data.elapsed}ms`)
          return
        }
        settled = true
        finish()
        controllers.forEach((controller, controllerIndex) => {
          if (controllerIndex !== index) controller.abort(new Error('market endpoint race settled'))
        })
        this.endpoint = data.endpoint
        data.preferredEndpoint = endpoints[0]
        if (data.endpoint !== this.config.endpoint) {
          data.fallbackReason = fallbackReason
          this.log('debug', `fallback endpoint selected: endpoint=${data.endpoint}, reason=${fallbackReason ?? 'unknown'}, elapsed=${data.elapsed}ms`)
          this.log('info', `market fallback endpoint selected: endpoint=${data.endpoint}, reason=${fallbackReason ?? 'unknown'}, elapsed=${data.elapsed}ms, primary=${endpoints[0]}`)
        } else {
          this.log('info', `market primary endpoint selected: endpoint=${data.endpoint}, elapsed=${data.elapsed}ms, source=${data.source}`)
        }
        this.recordRouteSuccess(data)
        resolve(data)
      }

      const fail = (endpoint: string, index: number, error: any) => {
        if (settled) return
        if (this.isStale(serial) || this.isInternalAbort(error)) {
          settled = true
          controllers.forEach(controller => controller.abort(new Error('market endpoint race cancelled')))
          finish()
          reject(error)
          return
        }
        this.recordRouteFailure(endpoint)
        lastError = error
        failed++
        if (index === 0) startFallback('primary-failed')
        if (failed < endpoints.length) return
        settled = true
        finish()
        this.log('debug', `all market endpoint candidates failed, count=${endpoints.length}`)
        reject(lastError)
      }

      const startEndpoint = (endpoint: string, index: number, waitIndex = 0) => {
        const signal = controllers[index].signal
        this.waitRouteTurn(waitIndex, signal).then(() => {
          if (settled) throw new Error('market endpoint race settled before request')
          return this.fetchEndpoint(endpoint, index, endpoints.length, serial, false, signal)
        }).then(data => settle(data, index)).catch(error => fail(endpoint, index, error))
      }

      const startFallback = (reason: NonNullable<EndpointResult['fallbackReason']>) => {
        if (settled || fallbackStarted) return
        fallbackStarted = true
        fallbackReason = reason
        this.log('debug', `start fallback market endpoint race, reason=${reason}, count=${endpoints.length - 1}, stagger=${ROUTE_STAGGER}ms`)
        this.log('info', `market fallback race started: reason=${reason}, count=${endpoints.length - 1}, stagger=${ROUTE_STAGGER}ms`)
        endpoints.slice(1).forEach((endpoint, fallbackIndex) => {
          startEndpoint(endpoint, fallbackIndex + 1, fallbackIndex)
        })
      }

      startEndpoint(endpoints[0], 0)
    })
  }

  private getEndpointCandidates() {
    const endpoints = [this.config.endpoint, ...(this.config.autoRoute === false ? [] : FALLBACK_ENDPOINTS)]
      .filter((endpoint, index, array): endpoint is string => !!endpoint && array.indexOf(endpoint) === index)
    return endpoints
  }

  private getEndpoints() {
    const endpoints = this.getEndpointCandidates()
    if (this.config.autoRoute === false) return endpoints
    const [primary, ...fallbacks] = endpoints
    const availableFallbacks = fallbacks.filter((endpoint) => {
      if (!this.isRouteCoolingDown(endpoint)) return true
      this.log('debug', `skip cooled market endpoint: endpoint=${endpoint}, until=${formatTime(this.routeStats[endpoint]?.cooldownUntil)}, failures=${this.routeStats[endpoint]?.consecutiveFailures ?? 0}`)
      return false
    })
    const originalIndex = new Map(fallbacks.map((endpoint, index) => [endpoint, index]))
    return [primary, ...availableFallbacks.sort((a, b) => {
      const delta = this.getRouteScore(b) - this.getRouteScore(a)
      if (delta) return delta
      return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0)
    })]
  }

  private getPreferredEndpoint() {
    return this.config.endpoint
  }

  private waitRouteTurn(index: number, signal?: AbortSignal) {
    if (!index) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason)
      const timer = setTimeout(resolve, index * ROUTE_STAGGER)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(signal.reason)
      }, { once: true })
    })
  }

  private getRouteScore(endpoint: string) {
    const stats = this.routeStats[endpoint]
    const cached = this.cacheEntries[endpoint]
    let score = endpoint === this.config.endpoint ? 1 : 0
    if (cached) {
      const age = Date.now() - cached.fetchedAt
      score += age <= Time.day ? 1.5 : 0.5
    }
    if (!stats) return score

    const total = stats.successes + stats.failures
    if (total) {
      const successRate = stats.successes / total
      score += (successRate - 0.5) * 6
      if (total >= 3 && successRate >= 0.8) score += 1.5
      if (total >= 3 && successRate < 0.35) score -= 2
    }
    score += stats.score
    score += Math.min(2, stats.successes * 0.25)
    score -= Math.min(2, stats.failures * 0.2)
    if (stats.averageElapsed != null) {
      if (stats.averageElapsed <= 300) score += 1.5
      else if (stats.averageElapsed <= FAST_ROUTE_THRESHOLD) score += 1
      else if (stats.averageElapsed <= 1200) score += 0.5
      else if (stats.averageElapsed <= 2500) score -= 0.3
      else if (stats.averageElapsed <= 4000) score -= 1
      else score -= 2
    }
    if (stats.contentEncoding === 'br') score += 0.5
    if (stats.contentEncoding === 'gzip') score += 0.2
    if (stats.lastSuccess && Date.now() - stats.lastSuccess <= Time.minute * 10) score += 1.5
    score -= Math.min(5, (stats.consecutiveFailures ?? 0) * 1.5)
    return score
  }

  private recordRouteSuccess(result: EndpointResult) {
    const stats = this.routeStats[result.endpoint] ||= { score: 0, successes: 0, failures: 0 }
    stats.successes++
    stats.consecutiveFailures = 0
    stats.cooldownUntil = undefined
    stats.failures = Math.max(0, Math.floor(stats.failures * 0.6))
    stats.score = clamp(stats.score + (result.elapsed <= FAST_ROUTE_THRESHOLD ? 0.4 : 0.1), -6, 3)
    stats.lastSuccess = Date.now()
    stats.contentEncoding = result.contentEncoding
    stats.averageElapsed = stats.averageElapsed == null
      ? result.elapsed
      : stats.averageElapsed * 0.7 + result.elapsed * 0.3
    this.log('debug', `route success updated: endpoint=${result.endpoint}, elapsed=${result.elapsed}ms, source=${result.source}, score=${stats.score.toFixed(2)}, successes=${stats.successes}, failures=${stats.failures}, average=${Math.round(stats.averageElapsed)}ms, encoding=${stats.contentEncoding ?? 'identity'}`)
    this.scheduleRouteStatsWrite()
  }

  private recordRouteFailure(endpoint: string) {
    const stats = this.routeStats[endpoint] ||= { score: 0, successes: 0, failures: 0 }
    stats.failures++
    stats.consecutiveFailures = (stats.consecutiveFailures ?? 0) + 1
    stats.cooldownUntil = Date.now() + getRouteCooldown(stats.consecutiveFailures)
    stats.score = clamp(stats.score - 1.2, -10, 3)
    this.log('debug', `route failure updated: endpoint=${endpoint}, score=${stats.score.toFixed(2)}, successes=${stats.successes}, failures=${stats.failures}, consecutive=${stats.consecutiveFailures}, cooldownUntil=${formatTime(stats.cooldownUntil)}, average=${stats.averageElapsed == null ? '-' : Math.round(stats.averageElapsed) + 'ms'}`)
    this.scheduleRouteStatsWrite()
  }

  private getRouteScores(endpoints = this.getEndpointCandidates()) {
    return endpoints.map((endpoint) => {
      const stats = this.routeStats[endpoint]
      const cache = this.cacheEntries[endpoint]
      return {
        endpoint,
        score: Math.round(this.getRouteScore(endpoint) * 10) / 10,
        successes: stats?.successes,
        failures: stats?.failures,
        consecutiveFailures: stats?.consecutiveFailures,
        cooldownUntil: stats?.cooldownUntil,
        coolingDown: this.isRouteCoolingDown(endpoint),
        averageElapsed: stats?.averageElapsed,
        lastSuccess: stats?.lastSuccess,
        contentEncoding: stats?.contentEncoding,
        cached: !!cache,
        cachedAt: cache?.fetchedAt,
      }
    })
  }

  private isRouteCoolingDown(endpoint: string) {
    if (endpoint === this.config.endpoint) return false
    const until = this.routeStats[endpoint]?.cooldownUntil
    return !!until && Date.now() < until
  }

  private clearRouteCooldowns(reason: string) {
    for (const stats of Object.values(this.routeStats)) {
      if (!stats) continue
      stats.cooldownUntil = undefined
      stats.consecutiveFailures = 0
    }
    this.log('debug', `market route cooldowns cleared: reason=${reason}`)
    this.scheduleRouteStatsWrite()
  }

  private getConditionalHeaders(endpoint: string) {
    const meta = this.cacheEntries[endpoint] || (this.conditionMeta?.endpoint === endpoint ? this.conditionMeta : undefined)
    if (!meta) return {}
    const headers: Dict<string> = {}
    if (meta.etag) headers['if-none-match'] = meta.etag
    if (meta.lastModified) headers['if-modified-since'] = meta.lastModified
    return headers
  }

  private updateCacheState(result: EndpointResult) {
    const cached = this.cacheEntries[result.endpoint]
    const sameEndpoint = this.conditionMeta?.endpoint === result.endpoint
    this.cacheResult = result.result
    this.conditionMeta = {
      endpoint: result.endpoint,
      fetchedAt: result.source === 'network' ? Date.now() : result.cachedAt ?? cached?.fetchedAt ?? this.conditionMeta?.fetchedAt ?? Date.now(),
      validatedAt: result.validatedAt,
      etag: result.etag ?? (sameEndpoint ? this.conditionMeta?.etag : undefined),
      lastModified: result.lastModified ?? (sameEndpoint ? this.conditionMeta?.lastModified : undefined),
      hash: result.hash ?? this.conditionMeta?.hash,
      size: result.size ?? this.conditionMeta?.size,
      wireSize: result.wireSize ?? this.conditionMeta?.wireSize,
      contentEncoding: result.contentEncoding ?? this.conditionMeta?.contentEncoding,
    }
    this.cacheEntries[result.endpoint] = {
      ...this.conditionMeta,
      result: result.result,
    }
  }

  private async fetchEndpoint(endpoint: string, index: number, total: number, serial: number, warnFailure = true, signal?: AbortSignal): Promise<EndpointResult> {
    if (this.isStale(serial)) throw new Error('market provider disposed')
    const start = Date.now()
    try {
      const http: HTTP = this.ctx.http.extend({
        ...this.config,
        endpoint,
      })
      const conditional = this.getConditionalHeaders(endpoint)
      const headers = {
        'accept-encoding': 'br,gzip,deflate',
        ...conditional,
      }
      const requestStart = Date.now()
      this.log('debug', `fetch market index from ${endpoint} (${index + 1}/${total}), timeout=${this.config.timeout ?? 'default'}, proxy=${this.config.proxyAgent ? 'yes' : 'no'}, compression=yes, conditional=${Object.keys(conditional).length ? 'yes' : 'no'}`)
      this.log('debug', `market request headers: endpoint=${endpoint}, acceptEncoding=br,gzip,deflate, etag=${conditional['if-none-match'] ?? '-'}, lastModified=${conditional['if-modified-since'] ?? '-'}`)
      const response = await http<string>('', {
        responseType: 'text',
        headers,
        signal,
        validateStatus: status => status === 304 || status >= 200 && status < 300,
      })
      if (this.isStale(serial)) throw new Error('market provider disposed')
      const requestElapsed = Date.now() - requestStart
      const etag = response.headers.get('etag') || undefined
      const lastModified = response.headers.get('last-modified') || undefined
      const contentEncoding = response.headers.get('content-encoding') || undefined
      const headerWireSize = parseContentLength(response.headers.get('content-length'))
      this.log('debug', `market response headers: endpoint=${endpoint}, status=${response.status}, request=${requestElapsed}ms, etag=${etag ?? '-'}, lastModified=${lastModified ?? '-'}, encoding=${contentEncoding ?? 'identity'}, contentLength=${formatBytes(headerWireSize)}`)

      const cached = this.cacheEntries[endpoint]

      if (response.status === 304) {
        if (!cached) {
          throw new Error(`market index from ${endpoint} returned 304 without cache`)
        }
        const elapsed = Date.now() - start
        const validatedAt = Date.now()
        this.log('debug', `market index not modified from ${endpoint} in ${elapsed}ms, reuse cache hash=${shortHash(cached.hash) || 'unknown'}`)
        this.log('info', `market index http-304: endpoint=${endpoint}, elapsed=${elapsed}ms, request=${requestElapsed}ms, cachedAt=${formatTime(cached.fetchedAt)}, hash=${shortHash(cached.hash) || 'unknown'}`)
        return {
          endpoint,
          result: cached.result,
          elapsed,
          candidates: total,
          source: 'http-304',
          timings: { request: requestElapsed, total: elapsed },
          size: cached.size,
          wireSize: headerWireSize ?? cached.wireSize,
          contentEncoding: contentEncoding ?? cached.contentEncoding,
          hash: cached.hash,
          etag: etag || cached.etag,
          lastModified: lastModified || cached.lastModified,
          cachedAt: cached.fetchedAt,
          validatedAt,
        }
      }

      const text = response.data
      const size = Buffer.byteLength(text)
      const wireSize = normalizeWireSize(headerWireSize, size)
      this.log('debug', `market response body decoded: endpoint=${endpoint}, chars=${text.length}, decodedSize=${formatBytes(size)}, wireSize=${formatBytes(wireSize)}, cachedHash=${shortHash(cached?.hash) ?? '-'}, cachedAt=${cached?.fetchedAt ? formatTime(cached.fetchedAt) : '-'}`)
      const hashStart = Date.now()
      const hash = createHash('sha256').update(text).digest('hex')
      const hashElapsed = Date.now() - hashStart
      this.log('debug', `market response hash computed: endpoint=${endpoint}, hash=${shortHash(hash) || 'unknown'}, elapsed=${hashElapsed}ms, unchanged=${!!cached && cached.hash === hash}`)

      if (cached && cached.hash === hash) {
        const elapsed = Date.now() - start
        const validatedAt = Date.now()
        this.log('debug', `market index hash unchanged from ${endpoint} in ${elapsed}ms, size=${size}, hash=${shortHash(hash)}`)
        this.log('info', `market index hash-cache: endpoint=${endpoint}, elapsed=${elapsed}ms, request=${requestElapsed}ms, hash=${shortHash(hash)}, size=${formatBytes(size)}, wireSize=${formatBytes(wireSize)}, encoding=${contentEncoding ?? 'identity'}`)
        return {
          endpoint,
          result: cached.result,
          elapsed,
          candidates: total,
          source: 'hash-cache',
          timings: { request: requestElapsed, hash: hashElapsed, total: elapsed },
          size,
          wireSize,
          contentEncoding,
          hash,
          etag,
          lastModified,
          cachedAt: cached.fetchedAt,
          validatedAt,
        }
      }

      const parseStart = Date.now()
      this.log('debug', `market json parse started: endpoint=${endpoint}, decodedSize=${formatBytes(size)}`)
      const result = JSON.parse(text) as SearchResult
      const parseElapsed = Date.now() - parseStart
      if (!Array.isArray(result?.objects)) {
        throw new Error(`invalid market index from ${endpoint}`)
      }
      this.log('debug', `market json parse completed: endpoint=${endpoint}, objects=${result.objects.length}, version=${result.version ?? 'legacy'}, elapsed=${parseElapsed}ms`)
      const elapsed = Date.now() - start
      this.log('debug', `market index fetched from ${endpoint} in ${elapsed}ms, objects=${result.objects.length}, size=${size}, wireSize=${wireSize ?? 'unknown'}, encoding=${contentEncoding ?? 'identity'}, hash=${shortHash(hash) || 'unknown'}, version=${result.version ?? 'legacy'}`)
      this.log('info', `market index fetched: endpoint=${endpoint}, elapsed=${elapsed}ms, request=${requestElapsed}ms, hash=${hashElapsed}ms, json=${parseElapsed}ms, objects=${result.objects.length}, size=${formatBytes(size)}, wireSize=${formatBytes(wireSize)}, encoding=${contentEncoding ?? 'identity'}, hash=${shortHash(hash) || 'unknown'}, version=${result.version ?? 'legacy'}`)
      return {
        endpoint,
        result,
        elapsed,
        candidates: total,
        source: 'network',
        timings: { request: requestElapsed, hash: hashElapsed, parse: parseElapsed, total: elapsed },
        size,
        wireSize,
        contentEncoding,
        hash,
        etag,
        lastModified,
      }
    } catch (error) {
      if (this.isStale(serial)) throw new Error('market provider disposed')
      this.log(warnFailure ? 'warn' : 'debug', `failed to fetch market index from ${endpoint} in ${Date.now() - start}ms: ${formatError(error)}`)
      this.log('debug', `market endpoint error detail: endpoint=${endpoint}, index=${index + 1}/${total}, warn=${warnFailure}, elapsed=${Date.now() - start}ms, stack=${formatStack(error)}`)
      throw error
    }
  }

  async get() {
    const start = Date.now()
    if (this.backgroundTask && this.hasCurrentMarketData()) {
      this.log('debug', `return current market payload while background refresh is running, hasScanner=${!!this.scanner}, hasPayload=${!!this.payload}, elapsed=${Date.now() - start}ms`)
      if (this.scanner) return this.createPayload(start, true)
      return {
        ...this.payload,
        stale: false,
        error: undefined,
        refreshing: true,
        loading: false,
        serverNow: Date.now(),
        debug: this.getDebugInfo(),
      }
    }
    if (!this.hasCurrentMarketData()) {
      const warmTask = this.warmDiskCacheTask
      if (warmTask) {
        const ready = await waitFor(warmTask, FIRST_PAYLOAD_TIMEOUT)
        if (ready && this.hasCurrentMarketData()) {
          this.log('debug', `return warm disk cache market payload, elapsed=${Date.now() - start}ms`)
          return this.createPayload(start, !!this.backgroundTask)
        }
      } else {
        const ready = await waitFor(this.warmDiskCache('first get'), Math.min(400, FIRST_PAYLOAD_TIMEOUT))
        if (ready && this.hasCurrentMarketData()) {
          this.log('debug', `return first-get disk cache market payload, elapsed=${Date.now() - start}ms`)
          return this.createPayload(start, !!this.backgroundTask)
        }
      }
    }
    const task = this.prepare()
    if (!this.hasCurrentMarketData()) {
      const ready = await waitFor(task, Math.max(0, FIRST_PAYLOAD_TIMEOUT - (Date.now() - start)))
      if (this.hasCurrentMarketData()) {
        this.log('debug', `return market payload after first-load wait, elapsed=${Date.now() - start}ms`)
        return this.createPayload(start, !!this.backgroundTask)
      }
      if (!ready) {
        this.refreshAfterPrepare(task)
        this.log('debug', `return loading market payload while waiting for network, elapsed=${Date.now() - start}ms`)
        this.log('info', `market first payload still waiting for network: elapsed=${Date.now() - start}ms, endpoint=${this.endpoint || this.config.endpoint}`)
        return {
          registry: this.endpoint || this.config.endpoint,
          data: {},
          failed: 0,
          total: 0,
          progress: 0,
          stale: false,
          error: undefined,
          cached: false,
          refreshing: true,
          loading: true,
          serverNow: Date.now(),
          debug: this.getDebugInfo({ total: Date.now() - start }),
        }
      }
    } else {
      await task
    }
    if (!this.scanner) {
      this.log('debug', `get market payload without scanner, cached=${!!this.payload}, elapsed=${Date.now() - start}ms`)
      return this.payload
        ? { ...this.payload, serverNow: Date.now(), debug: this.getDebugInfo() }
        : { data: {}, failed: 0, total: 0, progress: 0, serverNow: Date.now(), debug: this.getDebugInfo() }
    }
    if (this._error) {
      if (!this.payload && this.hasCurrentMarketData() && this.scanner) {
        this.createPayload(start, false)
      }
      if (this.payload) {
        const error = formatError(this._error)
        this.log('debug', `use cached market payload because current load failed: ${error}`)
        this.log('warn', `market load failed; returning previous payload: endpoint=${this.endpoint || this.config.endpoint}, total=${this.payload.total}, error=${error}`)
        return {
          ...this.payload,
          stale: true,
          error,
          refreshing: false,
          loading: false,
          serverNow: Date.now(),
          debug: this.getDebugInfo(),
        }
      }
      this.log('debug', `get market payload failed without cache, error=${formatError(this._error)}, elapsed=${Date.now() - start}ms`)
      return {
        registry: this.endpoint || this.config.endpoint,
        data: {},
        failed: 0,
        total: 0,
        progress: 0,
        stale: false,
        error: formatError(this._error),
        cached: false,
        refreshing: false,
        loading: false,
        serverNow: Date.now(),
        debug: this.getDebugInfo(),
      }
    }
    return this.createPayload(start)
  }

  private createPayload(start: number, refreshing = !!this.backgroundTask) {
    this._task ||= Promise.resolve(null)
    const payloadStart = Date.now()
    let data: Dict<SearchObject>
    let dataElapsed = 0
    if (this.indexMode === 'modern') {
      const dataStart = Date.now()
      data = Object.fromEntries(this.scanner.objects.map(item => [item.package.name, item]))
      dataElapsed = Date.now() - dataStart
    } else {
      data = this.fullCache
    }
    const payload = {
      registry: this.endpoint || this.ctx.installer.endpoint,
      data,
      failed: this.indexMode === 'modern' ? 0 : this.failed.length,
      total: this.scanner.total,
      progress: this.indexMode === 'modern' ? this.scanner.total : this.scanner.progress,
      gravatar: process.env.GRAVATAR_MIRROR,
      stale: false,
      error: undefined,
      cached: !!this.cacheMeta,
      cachedAt: this.cacheMeta?.fetchedAt,
      validatedAt: this.cacheMeta?.validatedAt,
      serverNow: Date.now(),
      refreshing,
      loading: false,
      debug: this.getDebugInfo({
        payloadData: dataElapsed,
        payload: Date.now() - payloadStart,
      }),
    }
    this.payload = payload
    this.log('debug', `get market payload completed: total=${payload.total}, progress=${payload.progress}, failed=${payload.failed}, stale=${!!payload.stale}, elapsed=${Date.now() - start}ms`)
    this.log('debug', `market payload detail: registry=${payload.registry}, cached=${payload.cached}, cachedAt=${payload.cachedAt ? formatTime(payload.cachedAt) : '-'}, validatedAt=${payload.validatedAt ? formatTime(payload.validatedAt) : '-'}, refreshing=${payload.refreshing}, payloadData=${payload.debug?.timings?.payloadData ?? '-'}ms, payload=${payload.debug?.timings?.payload ?? '-'}ms`)
    return payload
  }

  private refreshAfterPrepare(task: Promise<any>) {
    if (this.pendingRefreshTask === task) return
    this.pendingRefreshTask = task
    task.finally(async () => {
      if (this.pendingRefreshTask === task) this.pendingRefreshTask = undefined
      if (this.disposed || !this.ctx.scope.isActive) return
      await this.ctx.get('console')?.refresh('market')
    })
  }

  private applyIndex(result: SearchResult, endpoint: string) {
    if (!Array.isArray(result?.objects)) {
      throw new Error(`invalid market index from ${endpoint}`)
    }
    this.endpoint = endpoint
    this.indexMode = 'modern'
    const ignored = result.objects.filter(object => object.ignored).length
    this.scanner.objects = result.objects.filter(object => !object.ignored)
    this.scanner.total = this.scanner.objects.length
    this.scanner.version = result.version
    this.log('debug', `market index applied: endpoint=${endpoint}, version=${result.version ?? 'legacy'}, rawObjects=${result.objects.length}, ignored=${ignored}, visible=${this.scanner.total}`)
  }

  private async applyDiskCache(serial: number) {
    const warmTask = this.warmDiskCacheTask
    if (warmTask) {
      const warmed = await warmTask
      if (warmed && !this.isStale(serial) && this.scanner) return true
    }
    return this.loadDiskCache(serial)
  }

  private warmDiskCache(reason: string) {
    if (this.warmDiskCacheTask) return this.warmDiskCacheTask
    const serial = this.serial
    this.createScanner()
    this.warmDiskCacheTask = this.loadDiskCache(serial)
      .then((loaded) => {
        if (loaded) {
          this.log('debug', `warm market disk cache completed: reason=${reason}, serial=${serial}, objects=${this.scanner?.total ?? 0}`)
          if (this.ctx.scope.isActive && !this.disposed) void this.notifyMarketRefresh()
        }
        return loaded
      })
      .finally(() => {
        if (this.warmDiskCacheTask) this.warmDiskCacheTask = undefined
      })
    return this.warmDiskCacheTask
  }

  private async loadDiskCache(serial: number) {
    const start = Date.now()
    try {
      this.log('debug', `read market disk cache: file=${this.cacheFile}, preferred=${this.config.endpoint}, candidates=${this.getEndpointCandidates().join(', ')}`)
      const readStart = Date.now()
      const content = await fsp.readFile(this.cacheFile, 'utf8')
      const readElapsed = Date.now() - readStart
      const parseStart = Date.now()
      const rawStore = JSON.parse(content)
      const shouldMigrate = isLegacyInlineCacheStore(rawStore)
      const store = normalizeCacheStore(rawStore)
      const parseElapsed = Date.now() - parseStart
      this.cacheEntries = { ...this.cacheEntries, ...store.entries }
      if (store.routeStats) {
        for (const [endpoint, stats] of Object.entries(store.routeStats)) {
          if (!stats) continue
          // restore learned performance data, reset session counters
          const hasRecentSuccess = stats.lastSuccess && Date.now() - stats.lastSuccess < Time.day
          this.routeStats[endpoint] = {
            score: hasRecentSuccess ? clamp(stats.score, -1, 3) : clamp(stats.score, -4, 3),
            successes: 0,
            failures: 0,
            consecutiveFailures: hasRecentSuccess ? 0 : stats.consecutiveFailures,
            cooldownUntil: hasRecentSuccess ? undefined : stats.cooldownUntil,
            averageElapsed: stats.averageElapsed,
            lastSuccess: stats.lastSuccess,
            contentEncoding: stats.contentEncoding,
          }
        }
        this.log('debug', `market route stats restored from disk: ${Object.keys(store.routeStats).join(', ')}`)
      }
      this.log('debug', `market disk cache store parsed: bytes=${formatBytes(Buffer.byteLength(content))}, entries=${Object.keys(store.entries).length}, lastUsed=${store.lastUsed ?? '-'}, parse=${parseElapsed}ms, endpoints=${formatCacheEntries(store.entries)}`)
      const staleEndpoints = Object.values(store.entries)
        .filter((e): e is CacheEntry => !!e && Date.now() - e.fetchedAt > CACHE_ENTRY_TTL)
        .map(e => e.endpoint)
      if (staleEndpoints.length) {
        this.log('debug', `market disk cache has ${staleEndpoints.length} stale entries (>${CACHE_ENTRY_TTL / Time.day}d), will prune on next write: ${staleEndpoints.join(', ')}`)
        // mark so next successful fetch triggers a write that drops them
        this.cacheWriteTimer ??= setTimeout(() => {
          this.cacheWriteTimer = undefined
          if (this.conditionMeta) {
            void this.writeDiskCache({
              version: 3,
              entries: this.pruneCacheEntries(this.conditionMeta.endpoint),
              lastUsed: this.conditionMeta.endpoint,
              routeStats: this.serializeRouteStats(),
            })
          }
        }, 5000)
      }
      const cache = await this.pickDiskCache()
      if (!cache) {
        this.log('debug', `skip market disk cache because no cached endpoint matches candidates: ${Object.keys(store.entries).join(', ')}`)
        return false
      }
      if (this.isStale(serial)) return false
      const applyStart = Date.now()
      this.applyIndex(cache.result, cache.endpoint)
      const applyElapsed = Date.now() - applyStart
      const meta: CacheMeta = {
        endpoint: cache.endpoint,
        fetchedAt: cache.fetchedAt,
        validatedAt: cache.validatedAt,
        etag: cache.etag,
        lastModified: cache.lastModified,
        hash: cache.hash,
        size: cache.size,
        wireSize: cache.wireSize,
        contentEncoding: cache.contentEncoding,
      }
      this.cacheMeta = this.conditionMeta = meta
      this.cacheResult = cache.result
      this.cacheEntries[cache.endpoint] = cache
      this.updateDebugInfo({
        source: 'disk-cache',
        endpoint: cache.endpoint,
        preferredEndpoint: this.getPreferredEndpoint(),
        fallbackReason: undefined,
        size: cache.size,
        wireSize: cache.wireSize,
        contentEncoding: cache.contentEncoding,
        objects: this.scanner.total,
        hash: shortHash(cache.hash),
        etag: cache.etag,
        lastModified: cache.lastModified,
        cachedAt: cache.fetchedAt,
        validatedAt: cache.validatedAt,
        timings: {
          cacheRead: readElapsed,
          cacheParse: parseElapsed,
          apply: applyElapsed,
          total: Date.now() - start,
        },
      }, 'initial')
      this.log('debug', `loaded market index from disk cache: ${this.scanner.total}/${cache.result.objects.length} objects, endpoint=${cache.endpoint}, cachedAt=${new Date(cache.fetchedAt).toISOString()}, entries=${Object.keys(this.cacheEntries).length}, elapsed=${Date.now() - start}ms`)
      this.log('info', `market disk cache loaded: endpoint=${cache.endpoint}, objects=${this.scanner.total}, cachedAt=${formatTime(cache.fetchedAt)}, age=${formatAge(Date.now() - cache.fetchedAt)}, entries=${Object.keys(this.cacheEntries).length}, elapsed=${Date.now() - start}ms, size=${formatBytes(cache.size)}, wireSize=${formatBytes(cache.wireSize)}, encoding=${cache.contentEncoding ?? 'identity'}`)
      if (shouldMigrate) {
        this.log('debug', 'schedule market disk cache migration to split v3 layout')
        setTimeout(() => {
          if (this.disposed || !this.ctx.scope.isActive) return
          void this.writeDiskCache({
            version: 3,
            entries: this.pruneCacheEntries(cache.endpoint),
            lastUsed: cache.endpoint,
            routeStats: this.serializeRouteStats(),
          })
        }, 1000)
      }
      return true
    } catch (error) {
      if ((error as any)?.code !== 'ENOENT') {
        this.log('warn', `failed to read market disk cache: ${formatError(error)}`)
      } else {
        this.log('debug', 'market disk cache is empty')
      }
      return false
    }
  }

  private async pickDiskCache() {
    const endpoints = this.getEndpointCandidates()
    const primary = this.cacheEntries[this.config.endpoint]
    this.log('debug', `pick market disk cache: preferred=${this.config.endpoint}, endpointCandidates=${endpoints.join(', ')}, cachedEntries=${formatCacheEntries(this.cacheEntries)}`)
    const primaryCache = primary ? await this.loadCacheEntryResult(primary) : undefined
    if (primaryCache) {
      this.log('debug', `pick market disk cache primary hit: endpoint=${primaryCache.endpoint}, score=${this.getCacheScore(primaryCache).toFixed(2)}, cachedAt=${formatTime(primaryCache.fetchedAt)}, objects=${primaryCache.result.objects.length}`)
      return primaryCache
    }
    const candidates = endpoints
      .filter(endpoint => endpoint !== this.config.endpoint)
      .map(endpoint => this.cacheEntries[endpoint])
      .filter((cache): cache is CacheEntry => !!cache && hasCacheResultReference(cache))
      .sort((a, b) => {
        const delta = this.getCacheScore(b) - this.getCacheScore(a)
        if (delta) return delta
        return b.fetchedAt - a.fetchedAt
      })
    for (const entry of candidates) {
      const cache = await this.loadCacheEntryResult(entry)
      if (!cache) continue
      this.log('debug', `pick market disk cache fallback hit: endpoint=${cache.endpoint}, candidates=${candidates.map(item => `${item.endpoint} score=${this.getCacheScore(item).toFixed(2)} age=${formatAge(Date.now() - item.fetchedAt)} objects=${item.result?.objects?.length ?? item.objects ?? '-'}`).join(' | ')}`)
      return cache
    }
  }

  private async loadCacheEntryResult(entry: CacheEntry): Promise<CacheFile | undefined> {
    if (Array.isArray(entry.result?.objects)) return entry as CacheFile
    if (!entry.file) return
    try {
      const content = await fsp.readFile(resolve(this.cacheDir, entry.file), 'utf8')
      const result = JSON.parse(content) as SearchResult
      if (!Array.isArray(result?.objects)) return
      const cache: CacheFile = { ...entry, result }
      this.cacheEntries[entry.endpoint] = cache
      return cache
    } catch (error) {
      this.log('debug', `failed to read market split cache entry: endpoint=${entry.endpoint}, file=${entry.file}, error=${formatError(error)}`)
    }
  }

  private getCacheScore(cache: CacheEntry) {
    const age = Number.isFinite(cache.fetchedAt) ? Date.now() - cache.fetchedAt : Infinity
    let score = this.getRouteScore(cache.endpoint)
    if (age <= Time.hour * 12) score += 3
    else if (age <= Time.day * 3) score += 1
    else score -= 1
    if (cache.endpoint === this.config.endpoint) score += 0.5
    return score
  }

  private getCacheEntryFilename(endpoint: string) {
    return `${createHash('sha1').update(endpoint).digest('hex').slice(0, 16)}.json`
  }

  private createSplitCacheEntry(entry: CacheFile): CacheEntry {
    const { result, ...meta } = entry
    return {
      ...meta,
      file: this.getCacheEntryFilename(entry.endpoint),
      objects: result.objects.length,
    }
  }

  private async writeCacheEntryFile(entry: CacheFile) {
    await fsp.mkdir(this.cacheDir, { recursive: true })
    const file = resolve(this.cacheDir, this.getCacheEntryFilename(entry.endpoint))
    const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`
    await fsp.writeFile(tempFile, JSON.stringify(entry.result))
    await fsp.rename(tempFile, file)
  }

  private async pruneSplitCacheFiles(entries: Dict<CacheEntry>) {
    try {
      const keep = new Set(Object.values(entries).map(entry => entry?.file).filter(Boolean))
      const files = await fsp.readdir(this.cacheDir).catch(() => [])
      await Promise.all(files
        .filter(file => file.endsWith('.json') && !keep.has(file))
        .map(file => fsp.unlink(resolve(this.cacheDir, file)).catch(() => {})))
    } catch (error) {
      this.log('debug', `failed to prune split market cache files: ${formatError(error)}`)
    }
  }

  private scheduleDiskCacheWrite(result: SearchResult, meta = this.conditionMeta) {
    if (!meta) return
    clearTimeout(this.cacheWriteTimer)
    const entry: CacheFile = {
      ...meta,
      endpoint: meta.endpoint,
      fetchedAt: meta.fetchedAt,
      result,
    }
    this.cacheEntries[entry.endpoint] = entry
    const cache: CacheStore = {
      version: 3,
      entries: this.pruneCacheEntries(entry.endpoint),
      lastUsed: entry.endpoint,
      routeStats: this.serializeRouteStats(),
    }
    this.cacheEntries = cache.entries
    this.log('debug', `schedule market disk cache write: endpoint=${entry.endpoint}, objects=${result.objects.length}, entries=${Object.keys(cache.entries).length}, file=${this.cacheFile}, hash=${shortHash(entry.hash) ?? '-'}, size=${formatBytes(entry.size)}, wireSize=${formatBytes(entry.wireSize)}, encoding=${entry.contentEncoding ?? 'identity'}`)
    this.cacheWriteTimer = setTimeout(() => {
      this.cacheWriteTimer = undefined
      void this.writeDiskCache(cache)
    }, 0)
  }

  private scheduleRouteStatsWrite() {
    clearTimeout(this.routeStatsWriteTimer)
    this.routeStatsWriteTimer = setTimeout(() => {
      this.routeStatsWriteTimer = undefined
      if (this.disposed || !this.ctx.scope.isActive) return
      void this.writeRouteStatsCache()
    }, 1000)
  }

  private async writeRouteStatsCache() {
    const lastUsed = this.conditionMeta?.endpoint ?? this.config.endpoint
    let entries = this.pruneCacheEntries(lastUsed)
    let storeLastUsed = lastUsed
    if (!Object.keys(entries).length) {
      try {
        const content = await fsp.readFile(this.cacheFile, 'utf8')
        const store = normalizeCacheStore(JSON.parse(content))
        entries = store.entries
        storeLastUsed = store.lastUsed ?? lastUsed
        this.cacheEntries = { ...store.entries, ...this.cacheEntries }
      } catch (error) {
        if ((error as any)?.code !== 'ENOENT') {
          this.log('debug', `failed to merge market cache before route stats write: ${formatError(error)}`)
        }
      }
    }
    await this.writeDiskCache({
      version: 3,
      entries,
      lastUsed: storeLastUsed,
      routeStats: this.serializeRouteStats(),
    })
  }

  private serializeRouteStats(): Dict<PersistedRouteStats> {
    const result: Dict<PersistedRouteStats> = {}
    for (const [endpoint, stats] of Object.entries(this.routeStats)) {
      if (!stats) continue
      result[endpoint] = {
        score: clamp(stats.score, -6, 3),
        averageElapsed: stats.averageElapsed,
        lastSuccess: stats.lastSuccess,
        contentEncoding: stats.contentEncoding,
        consecutiveFailures: stats.consecutiveFailures,
        cooldownUntil: stats.cooldownUntil,
      }
    }
    return result
  }

  private pruneCacheEntries(lastUsed: string) {
    const entries = Object
      .values(this.cacheEntries)
      .filter((cache): cache is CacheEntry => !!cache && hasCacheResultReference(cache) && Date.now() - cache.fetchedAt <= CACHE_ENTRY_TTL)
      .sort((a, b) => {
        if (a.endpoint === lastUsed) return -1
        if (b.endpoint === lastUsed) return 1
        if (a.endpoint === this.config.endpoint) return -1
        if (b.endpoint === this.config.endpoint) return 1
        const delta = this.getCacheScore(b) - this.getCacheScore(a)
        if (delta) return delta
        return b.fetchedAt - a.fetchedAt
      })
      .slice(0, MAX_CACHE_ENTRIES)
    this.log('debug', `prune market disk cache entries: lastUsed=${lastUsed}, kept=${entries.map(entry => `${entry.endpoint} score=${this.getCacheScore(entry).toFixed(2)} age=${formatAge(Date.now() - entry.fetchedAt)} objects=${entry.result?.objects?.length ?? entry.objects ?? '-'}`).join(' | ')}`)
    return Object.fromEntries(entries.map(entry => [entry.endpoint, entry]))
  }

  private async writeDiskCache(cache: CacheStore) {
    if (this.disposed || !this.ctx.scope.isActive) return
    try {
      await fsp.mkdir(dirname(this.cacheFile), { recursive: true })
      const entries: Dict<CacheEntry> = {}
      for (const [endpoint, entry] of Object.entries(cache.entries)) {
        if (!entry) continue
        if (Array.isArray(entry.result?.objects)) {
          await this.writeCacheEntryFile(entry as CacheFile)
          entries[endpoint] = this.createSplitCacheEntry(entry as CacheFile)
        } else if (entry.file) {
          entries[endpoint] = entry
        }
      }
      const nextStore = JSON.stringify({
        ...cache,
        version: 3,
        entries,
      })
      const tempFile = `${this.cacheFile}.${process.pid}.${Date.now()}.tmp`
      await fsp.writeFile(tempFile, nextStore)
      await fsp.rename(tempFile, this.cacheFile)
      await this.pruneSplitCacheFiles(entries)
      const endpoints = Object.keys(cache.entries)
      this.log('debug', `wrote market disk cache store: entries=${endpoints.length}, lastUsed=${cache.lastUsed ?? 'unknown'}, endpoints=${endpoints.join(', ')}`)
    } catch (error) {
      this.log('warn', `failed to write market disk cache: ${formatError(error)}`)
    }
  }

  private refreshInBackground(serial: number, reason = 'background') {
    if (this.backgroundTask && this.backgroundSerial === serial) {
      this.log('debug', `skip ${reason} market refresh because background task is already running, serial=${serial}`)
      return false
    }
    if (this.backgroundTask) {
      this.log('debug', `replace stale background market refresh, oldSerial=${this.backgroundSerial ?? 'unknown'}, serial=${serial}, reason=${reason}`)
    }
    this.log('debug', `${reason} market refresh started, serial=${serial}`)
    this.log('info', `${reason} market refresh started: serial=${serial}, endpoint=${this.config.endpoint}, autoRoute=${this.config.autoRoute !== false}`)
    const task = this.refreshIndexInBackground(serial).finally(() => {
      if (this.backgroundTask !== task) return
      this.backgroundTask = undefined
      this.backgroundSerial = undefined
      void this.notifyMarketRefresh()
    })
    this.backgroundTask = task
    this.backgroundSerial = serial
    return true
  }

  private notifyMarketRefresh() {
    return this.ctx.get('console')?.refresh('market')
  }

  private async refreshIndexInBackground(serial: number) {
    const start = Date.now()
    this.log('debug', `start background market refresh, serial=${serial}`)
    try {
      const result = await this.fetchIndex(serial)
      if (this.isStale(serial)) return
      const applyStart = Date.now()
      this.applyIndex(result.result, result.endpoint)
      result.timings.apply = Date.now() - applyStart
      result.timings.total = Date.now() - start
      this.updateCacheState(result)
      if (result.source !== 'disk-cache') this.scheduleDiskCacheWrite(result.result, this.conditionMeta)
      this._error = null
      this.cacheMeta = undefined
      this.payload = undefined
      this.updateDebugInfo({
        source: result.source,
        endpoint: result.endpoint,
        preferredEndpoint: result.preferredEndpoint,
        fallbackReason: result.fallbackReason,
        candidates: result.candidates,
        size: result.size,
        wireSize: result.wireSize,
        contentEncoding: result.contentEncoding,
        objects: this.scanner.total,
        hash: shortHash(result.hash),
        etag: result.etag,
        lastModified: result.lastModified,
        cachedAt: result.cachedAt,
        validatedAt: result.validatedAt,
        timings: result.timings,
      }, 'refresh')
      await this.ctx.get('console')?.refresh('market')
      this.log('debug', `background market refresh completed in ${Date.now() - start}ms, endpoint=${this.endpoint}, source=${result.source}, objects=${this.scanner.total}`)
      this.log('info', `background market refresh completed: ${formatSnapshot({
        source: result.source,
        endpoint: result.endpoint,
        preferredEndpoint: result.preferredEndpoint,
        fallbackReason: result.fallbackReason,
        candidates: result.candidates,
        objects: this.scanner.total,
        size: result.size,
        wireSize: result.wireSize,
        contentEncoding: result.contentEncoding,
        cachedAt: result.cachedAt,
        validatedAt: result.validatedAt,
        timings: result.timings,
      })}`)
    } catch (error) {
      if (this.isStale(serial)) return
      this._error = error
      await this.ctx.get('console')?.refresh('market')
      this.log('warn', `background market refresh failed in ${Date.now() - start}ms: ${formatError(error)}`)
    }
  }

  private async probeIndexInBackground(serial: number, reason: string) {
    const start = Date.now()
    this.log('info', `${reason} market probe started: serial=${serial}, endpoint=${this.config.endpoint}, autoRoute=${this.config.autoRoute !== false}`)
    this.failed = []
    this.fullCache = {}
    this.tempCache = {}
    this.debugInfo = undefined
    this._task = null
    this._error = null
    this.createScanner()
    try {
      const result = await this.fetchIndex(serial)
      if (this.isStale(serial)) return false
      const applyStart = Date.now()
      this.applyIndex(result.result, result.endpoint)
      result.timings.apply = Date.now() - applyStart
      result.timings.total = Date.now() - start
      this.updateCacheState(result)
      if (result.source !== 'disk-cache') this.scheduleDiskCacheWrite(result.result, this.conditionMeta)
      this.cacheMeta = undefined
      this.payload = undefined
      this.updateDebugInfo({
        source: result.source,
        endpoint: result.endpoint,
        preferredEndpoint: result.preferredEndpoint,
        fallbackReason: result.fallbackReason,
        candidates: result.candidates,
        size: result.size,
        wireSize: result.wireSize,
        contentEncoding: result.contentEncoding,
        objects: this.scanner.total,
        hash: shortHash(result.hash),
        etag: result.etag,
        lastModified: result.lastModified,
        cachedAt: result.cachedAt,
        validatedAt: result.validatedAt,
        timings: result.timings,
      }, 'refresh')
      await this.notifyMarketRefresh()
      this.log('info', `${reason} market probe completed: ${formatSnapshot({
        source: result.source,
        endpoint: result.endpoint,
        preferredEndpoint: result.preferredEndpoint,
        fallbackReason: result.fallbackReason,
        candidates: result.candidates,
        objects: this.scanner.total,
        size: result.size,
        wireSize: result.wireSize,
        contentEncoding: result.contentEncoding,
        cachedAt: result.cachedAt,
        validatedAt: result.validatedAt,
        timings: result.timings,
      })}`)
      return true
    } catch (error) {
      if (this.isStale(serial)) return false
      this._error = error
      await this.notifyMarketRefresh()
      this.log('warn', `${reason} market probe failed in ${Date.now() - start}ms: ${formatError(error)}`)
      return false
    }
  }

  async probeInBackground(reason = 'idle probe') {
    if (!this.ctx.scope.isActive || this.disposed) return false
    if (this.backgroundTask) {
      this.log('debug', `reuse running background market refresh for ${reason}`)
      await this.backgroundTask
      return true
    }
    if (!this.hasCurrentMarketData() && !this.backgroundTask) {
      const serial = ++this.serial
      this.abortPendingRequests(`${reason} market probe superseded`)
      return this.probeIndexInBackground(serial, reason)
    }
    const serial = this.serial
    if (this.refreshInBackground(serial, reason)) {
      void this.notifyMarketRefresh()
      await this.backgroundTask
      return true
    }
    return false
  }

  private updateDebugInfo(info: MarketPerformanceSnapshot, phase?: 'initial' | 'refresh') {
    const next: MarketPerformance = {
      ...this.debugInfo,
      ...info,
      fallbackReason: info.fallbackReason,
      timings: {
        ...this.debugInfo?.timings,
        ...info.timings,
      },
      routeScores: this.getRouteScores(),
    }
    if (phase) next[phase] = { ...info }
    this.debugInfo = next
    this.log('debug', `market performance: source=${this.debugInfo.source ?? 'unknown'}, endpoint=${this.debugInfo.endpoint ?? 'unknown'}, preferred=${this.debugInfo.preferredEndpoint ?? 'unknown'}, objects=${this.debugInfo.objects ?? 0}, size=${this.debugInfo.size ?? 0}, wireSize=${this.debugInfo.wireSize ?? 'unknown'}, encoding=${this.debugInfo.contentEncoding ?? 'identity'}, timings=${formatTimings(this.debugInfo.timings)}`)
    this.log('debug', `market route scores: ${formatRouteScores(this.debugInfo.routeScores)}`)
  }

  private getDebugInfo(timings?: Dict<number>) {
    if (this.config.logLevel !== 'debug') return
    if (!timings) return this.debugInfo
    return {
      ...this.debugInfo,
      timings: {
        ...this.debugInfo?.timings,
        ...timings,
      },
    }
  }

  private isStale(serial = this.serial) {
    return this.disposed || serial !== this.serial || !this.ctx.scope.isActive
  }

  private trackController(controller: AbortController) {
    this.pendingControllers.add(controller)
    return controller
  }

  private untrackControllers(controllers: AbortController[]) {
    for (const controller of controllers) {
      this.pendingControllers.delete(controller)
    }
  }

  private abortPendingRequests(reason: string) {
    for (const controller of this.pendingControllers) {
      controller.abort(new Error(reason))
    }
    this.pendingControllers.clear()
  }

  private isInternalAbort(error: any) {
    const message = error instanceof Error ? error.message : String(error)
    return /race settled|stale|disposed|aborted|abort/i.test(message)
  }

  private log(level: Exclude<LogLevel, 'silent'>, message: string) {
    if (this.disposed || !this.ctx.scope.isActive) return
    if (logLevels.indexOf(this.config.logLevel ?? 'warn') < logLevels.indexOf(level)) return
    const logger = this.ctx.logger('market')
    if (level === 'debug') {
      // Koishi's global logger may hide debug records from the log page.
      // When market debug is explicitly enabled, mirror them as info records.
      logger.info(`[debug] ${message}`)
    } else {
      logger[level](message)
    }
  }
}

namespace MarketProvider {
  export interface Config {
    endpoint?: string
    timeout?: number
    proxyAgent?: string
    autoRoute?: boolean
    logLevel?: LogLevel
  }

  export const Config: Schema<Config> = Schema.object({
    endpoint: Schema.string().role('link').default(DEFAULT_ENDPOINT),
    timeout: Schema.number().role('time').default(Time.second * 30),
    proxyAgent: Schema.string().role('link'),
    autoRoute: Schema.boolean().default(true),
    logLevel: Schema.union(logLevels.map(level => Schema.const(level))).default('warn'),
  })
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function formatStack(error: unknown) {
  if (error instanceof Error) return error.stack || error.message
  return String(error)
}

function shortHash(hash?: string) {
  return hash?.slice(0, 12)
}

function formatTime(value?: number) {
  if (!value) return '-'
  return new Date(value).toISOString()
}

function formatAge(age?: number) {
  if (age == null || !Number.isFinite(age)) return '-'
  if (age < Time.second) return `${Math.max(0, Math.round(age))}ms`
  if (age < Time.minute) return `${Math.round(age / Time.second)}s`
  if (age < Time.hour) return `${Math.round(age / Time.minute)}m`
  if (age < Time.day) return `${Math.round(age / Time.hour)}h`
  return `${Math.round(age / Time.day)}d`
}

function formatBytes(value?: number) {
  if (value == null || !Number.isFinite(value)) return '-'
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)}KB`
  return `${Math.round(value)}B`
}

function parseContentLength(value?: string | null) {
  if (!value) return
  const size = Number(value)
  return Number.isFinite(size) && size >= 0 ? size : undefined
}

function normalizeWireSize(wireSize: number | undefined, decodedSize: number) {
  if (!wireSize && decodedSize > 0) return
  return wireSize
}

function getRouteCooldown(failures = 0) {
  if (failures <= 0) return 0
  if (failures === 1) return Time.minute
  if (failures === 2) return Time.minute * 5
  if (failures === 3) return Time.minute * 30
  if (failures === 4) return Time.hour * 4
  return Time.hour * 12
}

function formatSnapshot(snapshot: MarketPerformanceSnapshot = {}) {
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

function formatRouteScores(routes?: MarketPerformance['routeScores']) {
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

function formatCacheEntries(entries: Dict<CacheEntry>) {
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

function normalizeCacheStore(value: any): CacheStore {
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

function isLegacyInlineCacheStore(value: any) {
  if (!value || typeof value !== 'object') return false
  if (value.version !== 3) return true
  return Object.values(value.entries ?? {}).some((entry: any) => Array.isArray(entry?.result?.objects))
}

function normalizePersistedRouteStats(value: any): Dict<PersistedRouteStats> | undefined {
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

function normalizeCacheEntry(value: any): CacheEntry | undefined {
  const fetchedAt = Number(value?.fetchedAt)
  if (typeof value?.endpoint !== 'string') return
  if (!Number.isFinite(fetchedAt)) return
  if (!hasCacheResultReference(value)) return
  return { ...value, fetchedAt }
}

function hasCacheResultReference(value: any): value is CacheEntry {
  return Array.isArray(value?.result?.objects)
    || typeof value?.file === 'string'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

async function waitFor(task: Promise<any>, timeout: number) {
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

function formatTimings(timings: Dict<number> = {}) {
  return Object.entries(timings)
    .map(([key, value]) => `${key}=${Math.round(value)}ms`)
    .join(', ')
}

export default MarketProvider

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
const ROUTE_STAGGER = 120
const FIRST_PAYLOAD_TIMEOUT = Time.second * 1.5
const FAST_ROUTE_THRESHOLD = Time.second * 1.5
const MAX_CACHE_ENTRIES = 3
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

interface CacheStore {
  version: 2
  entries: Dict<CacheFile>
  lastUsed?: string
}

type CacheMeta = Omit<CacheFile, 'result'>

interface EndpointResult {
  endpoint: string
  preferredEndpoint?: string
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
  private cacheEntries: Dict<CacheFile> = {}
  private cacheMeta?: CacheMeta
  private conditionMeta?: CacheMeta
  private cacheResult?: SearchResult
  private debugInfo?: MarketPerformance
  private routeStats: Dict<RouteStats> = {}
  private backgroundTask?: Promise<void>
  private pendingRefreshTask?: Promise<any>
  private cacheWriteTimer?: ReturnType<typeof setTimeout>
  private flushData: () => void

  constructor(ctx: Context, public config: MarketProvider.Config = {}) {
    super(ctx)
    ctx.effect(() => () => {
      this.disposed = true
      this.serial++
      clearTimeout(this.cacheWriteTimer)
    })
    config.endpoint ||= DEFAULT_ENDPOINT
    this.endpoint = config.endpoint
    this.cacheFile = resolve(ctx.baseDir, 'cache', 'market-next-index.json')
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
  }

  async start(refresh = false) {
    const serial = ++this.serial
    const start = Date.now()
    this.log('debug', `start market refresh=${refresh}, serial=${serial}, endpoint=${this.config.endpoint}, timeout=${this.config.timeout ?? 'default'}, autoRoute=${this.config.autoRoute !== false}`)
    this.forceRefresh = refresh
    this.failed = []
    this.fullCache = {}
    this.tempCache = {}
    this.debugInfo = undefined
    if (refresh) {
      this._task = null
      this._error = null
      this.log('debug', 'refresh requested: reset market task')
    }
    try {
      await super.start(refresh)
    } finally {
      this.forceRefresh = false
    }
    if (this.isStale(serial)) {
      this.log('debug', `skip market refresh result because provider is stale, serial=${serial}`)
      return
    }
    this.log('debug', `market start completed in ${Date.now() - start}ms, serial=${serial}`)
  }

  async collect() {
    const serial = this.serial
    const { timeout } = this.config
    const registry = this.ctx.installer.http
    const start = Date.now()

    this.failed = []
    this.log('debug', `collect market index, serial=${serial}, searchEndpoint=${this.config.endpoint}, registryEndpoint=${registry?.config.endpoint}, timeout=${timeout ?? 'default'}`)
    this.scanner = new Scanner(<T>(url: string, config?: { timeout?: number }) => registry.get<T>(url, config))
    if (this.http) {
      if (!this.forceRefresh && await this.applyDiskCache(serial)) {
        this.refreshInBackground(serial)
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

  private async fetchIndex(serial: number): Promise<EndpointResult> {
    const endpoints = this.getEndpoints()
    this.log('debug', `market endpoint candidates: ${endpoints.join(', ')}`)

    if (endpoints.length === 1 || this.config.autoRoute === false) {
      const result = await this.fetchEndpoint(endpoints[0], 0, endpoints.length, serial)
      const { endpoint } = result
      this.endpoint = endpoint
      result.preferredEndpoint = endpoints[0]
      this.recordRouteSuccess(result)
      return result
    }

    this.log('debug', `race market endpoints with weighted stagger, count=${endpoints.length}, preferred=${endpoints[0]}, stagger=${ROUTE_STAGGER}ms`)
    return new Promise<EndpointResult>((resolve, reject) => {
      let settled = false
      let failed = 0
      let lastError: any
      const controllers = endpoints.map(() => new AbortController())

      endpoints.forEach((endpoint, index) => {
        const signal = controllers[index].signal
        this.waitRouteTurn(index, signal).then(() => {
          if (settled) throw new Error('market endpoint race settled before request')
          return this.fetchEndpoint(endpoint, index, endpoints.length, serial, false, signal)
        }).then((data) => {
          if (settled) {
            this.log('debug', `ignore slower market endpoint ${data.endpoint}, elapsed=${data.elapsed}ms`)
            return
          }
          settled = true
          controllers.forEach((controller, controllerIndex) => {
            if (controllerIndex !== index) controller.abort(new Error('market endpoint race settled'))
          })
          this.endpoint = data.endpoint
          if (data.endpoint !== this.config.endpoint) {
            this.log('debug', `fallback market index endpoint: ${data.endpoint}`)
          }
          data.preferredEndpoint = endpoints[0]
          this.recordRouteSuccess(data)
          resolve(data)
        }).catch((error) => {
          if (settled) return
          this.recordRouteFailure(endpoint)
          lastError = error
          failed++
          if (failed < endpoints.length) return
          this.log('debug', `all market endpoint candidates failed, count=${endpoints.length}`)
          reject(lastError)
        })
      })
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
    const originalIndex = new Map(endpoints.map((endpoint, index) => [endpoint, index]))
    return endpoints.slice().sort((a, b) => {
      const delta = this.getRouteScore(b) - this.getRouteScore(a)
      if (delta) return delta
      return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0)
    })
  }

  private getPreferredEndpoint() {
    return this.getEndpoints()[0] || this.config.endpoint
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
    if (total) score += (stats.successes / total - 0.5) * 4
    score += stats.score
    score += Math.min(1.5, stats.successes * 0.3)
    score -= Math.min(6, stats.failures * 1.2)
    if (stats.averageElapsed != null) {
      if (stats.averageElapsed <= 600) score += 4
      else if (stats.averageElapsed <= 1000) score += 3
      else if (stats.averageElapsed <= FAST_ROUTE_THRESHOLD) score += 2
      else if (stats.averageElapsed <= 2500) score += 0
      else if (stats.averageElapsed <= 4000) score -= 2
      else score -= 4
    }
    if (stats.contentEncoding === 'br') score += 0.5
    if (stats.contentEncoding === 'gzip') score += 0.2
    if (stats.lastSuccess && Date.now() - stats.lastSuccess <= Time.minute * 10) score += 0.5
    return score
  }

  private recordRouteSuccess(result: EndpointResult) {
    const stats = this.routeStats[result.endpoint] ||= { score: 0, successes: 0, failures: 0 }
    stats.successes++
    stats.score = clamp(stats.score + (result.elapsed <= FAST_ROUTE_THRESHOLD ? 0.5 : -0.5), -6, 3)
    stats.lastSuccess = Date.now()
    stats.contentEncoding = result.contentEncoding
    stats.averageElapsed = stats.averageElapsed == null
      ? result.elapsed
      : stats.averageElapsed * 0.7 + result.elapsed * 0.3
  }

  private recordRouteFailure(endpoint: string) {
    const stats = this.routeStats[endpoint] ||= { score: 0, successes: 0, failures: 0 }
    stats.failures++
    stats.score = clamp(stats.score - 2, -10, 3)
  }

  private getRouteScores(endpoints = this.getEndpoints()) {
    return endpoints.map((endpoint) => {
      const stats = this.routeStats[endpoint]
      const cache = this.cacheEntries[endpoint]
      return {
        endpoint,
        score: Math.round(this.getRouteScore(endpoint) * 10) / 10,
        successes: stats?.successes,
        failures: stats?.failures,
        averageElapsed: stats?.averageElapsed,
        lastSuccess: stats?.lastSuccess,
        contentEncoding: stats?.contentEncoding,
        cached: !!cache,
        cachedAt: cache?.fetchedAt,
      }
    })
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

      const cached = this.cacheEntries[endpoint]

      if (response.status === 304) {
        if (!cached) {
          throw new Error(`market index from ${endpoint} returned 304 without cache`)
        }
        const elapsed = Date.now() - start
        const validatedAt = Date.now()
        this.log('debug', `market index not modified from ${endpoint} in ${elapsed}ms, reuse cache hash=${shortHash(cached.hash) || 'unknown'}`)
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
      const hashStart = Date.now()
      const hash = createHash('sha256').update(text).digest('hex')
      const hashElapsed = Date.now() - hashStart

      if (cached && cached.hash === hash) {
        const elapsed = Date.now() - start
        const validatedAt = Date.now()
        this.log('debug', `market index hash unchanged from ${endpoint} in ${elapsed}ms, size=${size}, hash=${shortHash(hash)}`)
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
      const result = JSON.parse(text) as SearchResult
      const parseElapsed = Date.now() - parseStart
      if (!Array.isArray(result?.objects)) {
        throw new Error(`invalid market index from ${endpoint}`)
      }
      const elapsed = Date.now() - start
      this.log('debug', `market index fetched from ${endpoint} in ${elapsed}ms, objects=${result.objects.length}, size=${size}, wireSize=${wireSize ?? 'unknown'}, encoding=${contentEncoding ?? 'identity'}, hash=${shortHash(hash) || 'unknown'}, version=${result.version ?? 'legacy'}`)
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
      throw error
    }
  }

  async get() {
    const start = Date.now()
    const task = this.prepare()
    if (!this.scanner && !this.payload) {
      const ready = await waitFor(task, FIRST_PAYLOAD_TIMEOUT)
      if (!ready) {
        this.refreshAfterPrepare(task)
        this.log('debug', `return loading market payload while waiting for network, elapsed=${Date.now() - start}ms`)
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
          debug: this.getDebugInfo({ total: Date.now() - start }),
        }
      }
    } else {
      await task
    }
    if (!this.scanner) {
      this.log('debug', `get market payload without scanner, cached=${!!this.payload}, elapsed=${Date.now() - start}ms`)
      return this.payload ? { ...this.payload, debug: this.getDebugInfo() } : { data: {}, failed: 0, total: 0, progress: 0, debug: this.getDebugInfo() }
    }
    if (this._error) {
      if (this.payload) {
        const error = formatError(this._error)
        this.log('debug', `use cached market payload because current load failed: ${error}`)
        return {
          ...this.payload,
          stale: true,
          error,
          refreshing: false,
          loading: false,
          debug: this.getDebugInfo(),
        }
      }
      this.log('debug', `get market payload failed without cache, error=${formatError(this._error)}, elapsed=${Date.now() - start}ms`)
      return { data: {}, failed: 0, total: 0, progress: 0, debug: this.getDebugInfo() }
    }
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
      refreshing: !!this.backgroundTask,
      loading: false,
      debug: this.getDebugInfo({
        payloadData: dataElapsed,
        payload: Date.now() - payloadStart,
      }),
    }
    this.payload = payload
    this.log('debug', `get market payload completed: total=${payload.total}, progress=${payload.progress}, failed=${payload.failed}, stale=${!!payload.stale}, elapsed=${Date.now() - start}ms`)
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
    this.scanner.objects = result.objects.filter(object => !object.ignored)
    this.scanner.total = this.scanner.objects.length
    this.scanner.version = result.version
  }

  private async applyDiskCache(serial: number) {
    const start = Date.now()
    try {
      const readStart = Date.now()
      const content = await fsp.readFile(this.cacheFile, 'utf8')
      const readElapsed = Date.now() - readStart
      const parseStart = Date.now()
      const store = normalizeCacheStore(JSON.parse(content))
      const parseElapsed = Date.now() - parseStart
      this.cacheEntries = { ...this.cacheEntries, ...store.entries }
      const cache = this.pickDiskCache()
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

  private pickDiskCache() {
    const endpoints = this.getEndpointCandidates()
    const candidates = endpoints
      .map(endpoint => this.cacheEntries[endpoint])
      .filter((cache): cache is CacheFile => !!cache && Array.isArray(cache.result?.objects))
    if (!candidates.length) return
    return candidates.sort((a, b) => {
      const delta = this.getCacheScore(b) - this.getCacheScore(a)
      if (delta) return delta
      return b.fetchedAt - a.fetchedAt
    })[0]
  }

  private getCacheScore(cache: CacheFile) {
    const age = Number.isFinite(cache.fetchedAt) ? Date.now() - cache.fetchedAt : Infinity
    let score = this.getRouteScore(cache.endpoint)
    if (age <= Time.hour * 12) score += 3
    else if (age <= Time.day * 3) score += 1
    else score -= 1
    if (cache.endpoint === this.config.endpoint) score += 0.5
    return score
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
      version: 2,
      entries: this.pruneCacheEntries(entry.endpoint),
      lastUsed: entry.endpoint,
    }
    this.cacheEntries = cache.entries
    this.cacheWriteTimer = setTimeout(() => {
      this.cacheWriteTimer = undefined
      void this.writeDiskCache(cache)
    }, 0)
  }

  private pruneCacheEntries(lastUsed: string) {
    const entries = Object
      .values(this.cacheEntries)
      .filter((cache): cache is CacheFile => !!cache && Array.isArray(cache.result?.objects))
      .sort((a, b) => {
        if (a.endpoint === lastUsed) return -1
        if (b.endpoint === lastUsed) return 1
        const delta = this.getCacheScore(b) - this.getCacheScore(a)
        if (delta) return delta
        return b.fetchedAt - a.fetchedAt
      })
      .slice(0, MAX_CACHE_ENTRIES)
    return Object.fromEntries(entries.map(entry => [entry.endpoint, entry]))
  }

  private async writeDiskCache(cache: CacheStore) {
    if (this.disposed || !this.ctx.scope.isActive) return
    try {
      await fsp.mkdir(dirname(this.cacheFile), { recursive: true })
      await fsp.writeFile(this.cacheFile, JSON.stringify(cache))
      const endpoints = Object.keys(cache.entries)
      this.log('debug', `wrote market disk cache store: entries=${endpoints.length}, lastUsed=${cache.lastUsed ?? 'unknown'}, endpoints=${endpoints.join(', ')}`)
    } catch (error) {
      this.log('warn', `failed to write market disk cache: ${formatError(error)}`)
    }
  }

  private refreshInBackground(serial: number) {
    if (this.backgroundTask) return
    this.backgroundTask = this.refreshIndexInBackground(serial).finally(() => {
      this.backgroundTask = undefined
    })
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
    } catch (error) {
      if (this.isStale(serial)) return
      this._error = error
      await this.ctx.get('console')?.refresh('market')
      this.log('warn', `background market refresh failed in ${Date.now() - start}ms: ${formatError(error)}`)
    }
  }

  private updateDebugInfo(info: MarketPerformanceSnapshot, phase?: 'initial' | 'refresh') {
    const next: MarketPerformance = {
      ...this.debugInfo,
      ...info,
      timings: {
        ...this.debugInfo?.timings,
        ...info.timings,
      },
      routeScores: this.getRouteScores(),
    }
    if (phase) next[phase] = { ...info }
    this.debugInfo = next
    this.log('debug', `market performance: source=${this.debugInfo.source ?? 'unknown'}, endpoint=${this.debugInfo.endpoint ?? 'unknown'}, preferred=${this.debugInfo.preferredEndpoint ?? 'unknown'}, objects=${this.debugInfo.objects ?? 0}, size=${this.debugInfo.size ?? 0}, wireSize=${this.debugInfo.wireSize ?? 'unknown'}, encoding=${this.debugInfo.contentEncoding ?? 'identity'}, timings=${formatTimings(this.debugInfo.timings)}`)
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

  private log(level: Exclude<LogLevel, 'silent'>, message: string) {
    if (this.disposed || !this.ctx.scope.isActive) return
    if (logLevels.indexOf(this.config.logLevel ?? 'warn') < logLevels.indexOf(level)) return
    this.ctx.logger('market')[level](message)
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

function shortHash(hash?: string) {
  return hash?.slice(0, 12)
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

function normalizeCacheStore(value: any): CacheStore {
  if (value?.version === 2 && value.entries && typeof value.entries === 'object') {
    const entries: Dict<CacheFile> = {}
    for (const endpoint in value.entries) {
      const entry = normalizeCacheEntry(value.entries[endpoint])
      if (entry) entries[entry.endpoint] = entry
    }
    return { version: 2, entries, lastUsed: value.lastUsed }
  }
  const entry = normalizeCacheEntry(value)
  if (entry) {
    return {
      version: 2,
      entries: { [entry.endpoint]: entry },
      lastUsed: entry.endpoint,
    }
  }
  return { version: 2, entries: {} }
}

function normalizeCacheEntry(value: any): CacheFile | undefined {
  const fetchedAt = Number(value?.fetchedAt)
  if (typeof value?.endpoint !== 'string') return
  if (!Number.isFinite(fetchedAt)) return
  if (!Array.isArray(value.result?.objects)) return
  return { ...value, fetchedAt }
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

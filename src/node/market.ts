import { Context, Dict, HTTP, Schema, Time } from 'koishi'
import Scanner, { SearchObject, SearchResult } from '@koishijs/registry'
import { MarketPerformance, MarketProvider as BaseMarketProvider } from '../shared'
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

type CacheMeta = Omit<CacheFile, 'result'>

interface EndpointResult {
  endpoint: string
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
  private cacheMeta?: CacheMeta
  private conditionMeta?: CacheMeta
  private cacheResult?: SearchResult
  private debugInfo?: MarketPerformance
  private backgroundTask?: Promise<void>
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
    let refreshTask: Promise<void>
    if (refresh) {
      this._task = null
      this._error = null
      this.log('debug', 'refresh requested: reset market task and refresh dependency data')
      refreshTask = this.ctx.installer.refresh(true).catch(error => this.ctx.logger('market').warn(error))
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
    await refreshTask
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
      if (result.source === 'network') this.scheduleDiskCacheWrite(result.result, this.conditionMeta)
      this.cacheMeta = undefined
      this.updateDebugInfo({
        source: result.source,
        endpoint: result.endpoint,
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
      })
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
      return result
    }

    this.log('debug', `race market endpoints concurrently, count=${endpoints.length}`)
    return new Promise<EndpointResult>((resolve, reject) => {
      let settled = false
      let failed = 0
      let lastError: any
      const controllers = endpoints.map(() => new AbortController())

      endpoints.forEach((endpoint, index) => {
        this.fetchEndpoint(endpoint, index, endpoints.length, serial, false, controllers[index].signal).then((data) => {
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
          resolve(data)
        }).catch((error) => {
          if (settled) return
          lastError = error
          failed++
          if (failed < endpoints.length) return
          this.log('debug', `all market endpoint candidates failed, count=${endpoints.length}`)
          reject(lastError)
        })
      })
    })
  }

  private getEndpoints() {
    return [this.config.endpoint, ...(this.config.autoRoute === false ? [] : FALLBACK_ENDPOINTS)]
      .filter((endpoint, index, array): endpoint is string => !!endpoint && array.indexOf(endpoint) === index)
  }

  private getConditionalHeaders(endpoint: string) {
    const meta = this.conditionMeta
    if (!meta || meta.endpoint !== endpoint || !this.cacheResult) return {}
    const headers: Dict<string> = {}
    if (meta.etag) headers['if-none-match'] = meta.etag
    if (meta.lastModified) headers['if-modified-since'] = meta.lastModified
    return headers
  }

  private updateCacheState(result: EndpointResult) {
    const sameEndpoint = this.conditionMeta?.endpoint === result.endpoint
    this.cacheResult = result.result
    this.conditionMeta = {
      endpoint: result.endpoint,
      fetchedAt: result.source === 'network' ? Date.now() : result.cachedAt ?? this.conditionMeta?.fetchedAt ?? Date.now(),
      validatedAt: result.validatedAt,
      etag: result.etag ?? (sameEndpoint ? this.conditionMeta?.etag : undefined),
      lastModified: result.lastModified ?? (sameEndpoint ? this.conditionMeta?.lastModified : undefined),
      hash: result.hash ?? this.conditionMeta?.hash,
      size: result.size ?? this.conditionMeta?.size,
      wireSize: result.wireSize ?? this.conditionMeta?.wireSize,
      contentEncoding: result.contentEncoding ?? this.conditionMeta?.contentEncoding,
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

      if (response.status === 304) {
        if (!this.cacheResult || !this.conditionMeta) {
          throw new Error(`market index from ${endpoint} returned 304 without cache`)
        }
        const elapsed = Date.now() - start
        const validatedAt = Date.now()
        this.log('debug', `market index not modified from ${endpoint} in ${elapsed}ms, reuse cache hash=${shortHash(this.conditionMeta.hash) || 'unknown'}`)
        return {
          endpoint,
          result: this.cacheResult,
          elapsed,
          candidates: total,
          source: 'http-304',
          timings: { request: requestElapsed, total: elapsed },
          size: this.conditionMeta.size,
          wireSize: headerWireSize ?? this.conditionMeta.wireSize,
          contentEncoding: contentEncoding ?? this.conditionMeta.contentEncoding,
          hash: this.conditionMeta.hash,
          etag: etag || this.conditionMeta.etag,
          lastModified: lastModified || this.conditionMeta.lastModified,
          cachedAt: this.conditionMeta.fetchedAt,
          validatedAt,
        }
      }

      const text = response.data
      const size = Buffer.byteLength(text)
      const wireSize = normalizeWireSize(headerWireSize, size)
      const hashStart = Date.now()
      const hash = createHash('sha256').update(text).digest('hex')
      const hashElapsed = Date.now() - hashStart

      if (this.cacheResult && this.conditionMeta?.hash === hash) {
        const elapsed = Date.now() - start
        const validatedAt = Date.now()
        this.log('debug', `market index hash unchanged from ${endpoint} in ${elapsed}ms, size=${size}, hash=${shortHash(hash)}`)
        return {
          endpoint,
          result: this.cacheResult,
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
          cachedAt: this.conditionMeta.fetchedAt,
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
    await this.prepare()
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
      debug: this.getDebugInfo({
        payloadData: dataElapsed,
        payload: Date.now() - payloadStart,
      }),
    }
    this.payload = payload
    this.log('debug', `get market payload completed: total=${payload.total}, progress=${payload.progress}, failed=${payload.failed}, stale=${!!payload.stale}, elapsed=${Date.now() - start}ms`)
    return payload
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
      const cache = JSON.parse(content) as CacheFile
      const parseElapsed = Date.now() - parseStart
      if (!this.getEndpoints().includes(cache.endpoint)) {
        this.log('debug', `skip market disk cache from unrelated endpoint: ${cache.endpoint}`)
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
      this.updateDebugInfo({
        source: 'disk-cache',
        endpoint: cache.endpoint,
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
      })
      this.log('debug', `loaded market index from disk cache: ${this.scanner.total}/${cache.result.objects.length} objects, endpoint=${cache.endpoint}, cachedAt=${new Date(cache.fetchedAt).toISOString()}, elapsed=${Date.now() - start}ms`)
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

  private scheduleDiskCacheWrite(result: SearchResult, meta = this.conditionMeta) {
    if (!meta) return
    clearTimeout(this.cacheWriteTimer)
    const cache: CacheFile = {
      ...meta,
      endpoint: meta.endpoint,
      fetchedAt: meta.fetchedAt,
      result,
    }
    this.cacheWriteTimer = setTimeout(() => {
      this.cacheWriteTimer = undefined
      void this.writeDiskCache(cache)
    }, 0)
  }

  private async writeDiskCache(cache: CacheFile) {
    if (this.disposed || !this.ctx.scope.isActive) return
    try {
      await fsp.mkdir(dirname(this.cacheFile), { recursive: true })
      await fsp.writeFile(this.cacheFile, JSON.stringify(cache))
      this.log('debug', `wrote market disk cache: endpoint=${cache.endpoint}, objects=${cache.result.objects.length}, size=${cache.size ?? 0}, hash=${shortHash(cache.hash) || 'unknown'}`)
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
      if (result.source === 'network') this.scheduleDiskCacheWrite(result.result, this.conditionMeta)
      this._error = null
      this.cacheMeta = undefined
      this.payload = undefined
      this.updateDebugInfo({
        source: result.source,
        endpoint: result.endpoint,
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
      })
      await this.ctx.get('console')?.refresh('market')
      this.log('debug', `background market refresh completed in ${Date.now() - start}ms, endpoint=${this.endpoint}, source=${result.source}, objects=${this.scanner.total}`)
    } catch (error) {
      if (this.isStale(serial)) return
      this._error = error
      await this.ctx.get('console')?.refresh('market')
      this.log('warn', `background market refresh failed in ${Date.now() - start}ms: ${formatError(error)}`)
    }
  }

  private updateDebugInfo(info: MarketPerformance) {
    this.debugInfo = {
      ...this.debugInfo,
      ...info,
      timings: {
        ...this.debugInfo?.timings,
        ...info.timings,
      },
    }
    this.log('debug', `market performance: source=${this.debugInfo.source ?? 'unknown'}, endpoint=${this.debugInfo.endpoint ?? 'unknown'}, objects=${this.debugInfo.objects ?? 0}, size=${this.debugInfo.size ?? 0}, wireSize=${this.debugInfo.wireSize ?? 'unknown'}, encoding=${this.debugInfo.contentEncoding ?? 'identity'}, timings=${formatTimings(this.debugInfo.timings)}`)
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

function formatTimings(timings: Dict<number> = {}) {
  return Object.entries(timings)
    .map(([key, value]) => `${key}=${Math.round(value)}ms`)
    .join(', ')
}

export default MarketProvider

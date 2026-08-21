import { Context, Dict, HTTP, Schema, Time } from 'koishi'
import Scanner, { SearchObject, SearchResult } from '@koishijs/registry'
import { MarketPerformance, MarketPerformanceSnapshot, MarketProvider as BaseMarketProvider } from '../shared'
import {
  FIRST_PAYLOAD_TIMEOUT,
  formatAge,
  formatBytes,
  formatError,
  formatRouteScores,
  formatSnapshot,
  formatTime,
  formatTimings,
  logLevels,
  shortHash,
  waitFor,
  type EndpointResult,
  type LogLevel,
  type MarketProviderConfig,
} from './market-internals'
import { MarketDiskCache } from './market-cache'
import { MarketRouter } from './market-router'
import { createMarketResultSnapshot } from './market-result'

export const DEFAULT_ENDPOINT = 'https://registry.koishi.t4wefan.pub/index.json'

class MarketProvider extends BaseMarketProvider {
  private http: HTTP
  private failed: string[] = []
  private scanner: Scanner
  private fullCache: Dict<SearchObject> = {}
  private tempCache: Dict<SearchObject> = {}
  private payload?: BaseMarketProvider.Payload
  private payloadData?: Dict<SearchObject>
  private payloadDataVersion = -1
  private endpoint: string
  private disposed = false
  private serial = 0
  private dataVersion = 0
  private contentHash?: string
  private forceRefresh = false
  private indexMode: 'modern' | 'legacy' = 'modern'
  private cache: MarketDiskCache
  private router: MarketRouter
  private debugInfo?: MarketPerformance
  private backgroundTask?: Promise<void>
  private backgroundSerial?: number
  private pendingRefreshTask?: Promise<any>
  private warmDiskCacheTask?: Promise<boolean>
  private flushData: () => void

  constructor(ctx: Context, public config: MarketProvider.Config = {}) {
    super(ctx)
    config.endpoint ||= DEFAULT_ENDPOINT
    this.endpoint = config.endpoint
    this.cache = new MarketDiskCache(ctx, config, {
      getEndpointCandidates: () => this.router.getEndpointCandidates(),
      getRouteScore: endpoint => this.router.getScore(endpoint),
      getRouteStats: () => this.router.serializeStats(),
      restoreRouteStats: stats => this.router.restoreStats(stats),
      isStale: serial => this.isStale(serial),
      isActive: () => !this.disposed && ctx.scope.isActive,
      log: (level, message) => this.log(level, message),
    })
    this.router = new MarketRouter(ctx, config, this.cache, {
      isStale: serial => this.isStale(serial),
      selectEndpoint: endpoint => this.endpoint = endpoint,
      onStatsChanged: () => this.cache.scheduleRouteStatsWrite(),
      log: (level, message) => this.log(level, message),
    })
    ctx.effect(() => () => {
      this.disposed = true
      this.serial++
      this.cache.dispose()
      this.router.abortPendingRequests('market provider disposed')
    })
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
    if (!reuseBackground) this.router.abortPendingRequests('market refresh superseded')
    const start = Date.now()
    this.log('debug', `start market refresh=${refresh}, serial=${serial}, endpoint=${this.config.endpoint}, timeout=${this.config.timeout ?? 'default'}, autoRoute=${this.config.autoRoute !== false}`)
    if (refresh) {
      this.log('info', `market refresh requested: endpoint=${this.config.endpoint}, autoRoute=${this.config.autoRoute !== false}, cache=${this.hasCurrentMarketData() ? 'warm' : 'cold'}`)
      this.router.clearCooldowns('manual refresh')
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
      await this.getSnapshot()
      await this.refresh()
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
      const result = await this.router.fetchIndex(serial)
      if (this.isStale(serial)) {
        this.log('debug', `drop fetched market index because provider is stale, serial=${serial}`)
        return null
      }
      const snapshot = this.applyEndpointResult(result, start, { phase: 'initial' })
      this.log('debug', `loaded market index from ${this.endpoint}: ${this.scanner.total}/${result.result.objects.length} objects, source=${result.source}, version=${this.scanner.version ?? 'legacy'}, elapsed=${Date.now() - start}ms`)
      this.log('info', `market index ready: ${formatSnapshot(snapshot)}`)
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
      this.dataVersion++
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

  async get() {
    const current = this.payload
    const total = this.scanner?.total ?? current?.total ?? 0
    const progress = this.indexMode === 'modern'
      ? total
      : this.scanner?.progress ?? current?.progress ?? 0
    return {
      registry: current?.registry || this.endpoint || this.config.endpoint,
      failed: current?.failed ?? (this.indexMode === 'modern' ? 0 : this.failed.length),
      total,
      progress,
      gravatar: process.env.GRAVATAR_MIRROR,
      stale: current?.stale ?? false,
      error: current?.error ?? (this._error ? formatError(this._error) : undefined),
      cached: current?.cached ?? !!this.cache.diskMeta,
      cachedAt: current?.cachedAt ?? this.cache.diskMeta?.fetchedAt,
      validatedAt: current?.validatedAt ?? this.cache.diskMeta?.validatedAt,
      serverNow: Date.now(),
      refreshing: !!this.backgroundTask,
      loading: !this.hasCurrentMarketData() && !this._error,
      dataVersion: this.dataVersion,
      debug: this.getDebugInfo(),
    }
  }

  async getSnapshot() {
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
        dataVersion: this.dataVersion,
        serverNow: Date.now(),
        debug: this.getDebugInfo(),
      }
    }
    if (this.payload && !this._error) {
      return {
        ...this.payload,
        dataVersion: this.dataVersion,
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
          dataVersion: this.dataVersion,
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
        : { data: {}, dataVersion: this.dataVersion, failed: 0, total: 0, progress: 0, serverNow: Date.now(), debug: this.getDebugInfo() }
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
          dataVersion: this.dataVersion,
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
        dataVersion: this.dataVersion,
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
    const reuseData = !!this.payloadData && this.payloadDataVersion === this.dataVersion
    if (reuseData) {
      data = this.payloadData!
    } else if (this.indexMode === 'modern') {
      const dataStart = Date.now()
      data = {}
      for (const item of this.scanner.objects) {
        data[item.package.name] = item
      }
      dataElapsed = Date.now() - dataStart
    } else {
      data = this.fullCache
    }
    this.payloadData = data
    this.payloadDataVersion = this.dataVersion
    const payload = {
      registry: this.endpoint || this.ctx.installer.endpoint,
      data,
      dataVersion: this.dataVersion,
      failed: this.indexMode === 'modern' ? 0 : this.failed.length,
      total: this.scanner.total,
      progress: this.indexMode === 'modern' ? this.scanner.total : this.scanner.progress,
      gravatar: process.env.GRAVATAR_MIRROR,
      stale: false,
      error: undefined,
      cached: !!this.cache.diskMeta,
      cachedAt: this.cache.diskMeta?.fetchedAt,
      validatedAt: this.cache.diskMeta?.validatedAt,
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
    this.log('debug', `market payload detail: registry=${payload.registry}, cached=${payload.cached}, cachedAt=${payload.cachedAt ? formatTime(payload.cachedAt) : '-'}, validatedAt=${payload.validatedAt ? formatTime(payload.validatedAt) : '-'}, refreshing=${payload.refreshing}, payloadData=${payload.debug?.timings?.payloadData ?? '-'}ms, payloadDataReused=${reuseData}, payload=${payload.debug?.timings?.payload ?? '-'}ms`)
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

  private applyIndex(result: SearchResult, endpoint: string, contentHash?: string) {
    if (!Array.isArray(result?.objects)) {
      throw new Error(`invalid market index from ${endpoint}`)
    }
    this.endpoint = endpoint
    this.indexMode = 'modern'
    let ignored = 0
    const objects: SearchObject[] = []
    for (const object of result.objects) {
      if (object.ignored) ignored++
      else objects.push(object)
    }
    this.scanner.objects = objects
    this.scanner.total = objects.length
    this.scanner.version = result.version
    if (!contentHash || contentHash !== this.contentHash) this.dataVersion++
    this.contentHash = contentHash
    this.log('debug', `market index applied: endpoint=${endpoint}, version=${result.version ?? 'legacy'}, rawObjects=${result.objects.length}, ignored=${ignored}, visible=${this.scanner.total}`)
  }

  private applyEndpointResult(
    result: EndpointResult,
    startedAt: number,
    options: {
      phase: 'initial' | 'refresh'
      clearError?: boolean
      invalidatePayload?: boolean
    },
  ) {
    const applyStart = Date.now()
    this.applyIndex(result.result, result.endpoint, result.hash)
    result.timings.apply = Date.now() - applyStart
    result.timings.total = Date.now() - startedAt
    this.cache.updateFromEndpoint(result)
    if (result.source !== 'disk-cache') this.cache.scheduleWrite(result.result)
    if (options.clearError) this._error = null
    this.cache.clearDiskMeta()
    if (options.invalidatePayload) this.payload = undefined
    const snapshot = createMarketResultSnapshot(result, this.scanner.total)
    this.updateDebugInfo(snapshot, options.phase)
    return snapshot
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
    try {
      const loaded = await this.cache.load(serial)
      if (!loaded) return false
      const { entry, readElapsed, parseElapsed, start } = loaded
      const applyStart = Date.now()
      this.applyIndex(entry.result, entry.endpoint, entry.hash)
      const applyElapsed = Date.now() - applyStart
      this.cache.activate(entry)
      this.updateDebugInfo({
        source: 'disk-cache',
        endpoint: entry.endpoint,
        preferredEndpoint: this.router.getPreferredEndpoint(),
        fallbackReason: undefined,
        size: entry.size,
        wireSize: entry.wireSize,
        contentEncoding: entry.contentEncoding,
        objects: this.scanner.total,
        hash: shortHash(entry.hash),
        etag: entry.etag,
        lastModified: entry.lastModified,
        cachedAt: entry.fetchedAt,
        validatedAt: entry.validatedAt,
        timings: {
          cacheRead: readElapsed,
          cacheParse: parseElapsed,
          apply: applyElapsed,
          total: Date.now() - start,
        },
      }, 'initial')
      this.log('debug', `loaded market index from disk cache: ${this.scanner.total}/${entry.result.objects.length} objects, endpoint=${entry.endpoint}, cachedAt=${new Date(entry.fetchedAt).toISOString()}, entries=${Object.keys(this.cache.entries).length}, elapsed=${Date.now() - start}ms`)
      this.log('info', `market disk cache loaded: endpoint=${entry.endpoint}, objects=${this.scanner.total}, cachedAt=${formatTime(entry.fetchedAt)}, age=${formatAge(Date.now() - entry.fetchedAt)}, entries=${Object.keys(this.cache.entries).length}, elapsed=${Date.now() - start}ms, size=${formatBytes(entry.size)}, wireSize=${formatBytes(entry.wireSize)}, encoding=${entry.contentEncoding ?? 'identity'}`)
      return true
    } catch (error) {
      this.log('warn', `failed to apply market disk cache: ${formatError(error)}`)
      return false
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
      const result = await this.router.fetchIndex(serial)
      if (this.isStale(serial)) return
      const snapshot = this.applyEndpointResult(result, start, {
        phase: 'refresh',
        clearError: true,
        invalidatePayload: true,
      })
      await this.ctx.get('console')?.refresh('market')
      this.log('debug', `background market refresh completed in ${Date.now() - start}ms, endpoint=${this.endpoint}, source=${result.source}, objects=${this.scanner.total}`)
      this.log('info', `background market refresh completed: ${formatSnapshot(snapshot)}`)
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
      const result = await this.router.fetchIndex(serial)
      if (this.isStale(serial)) return false
      const snapshot = this.applyEndpointResult(result, start, {
        phase: 'refresh',
        invalidatePayload: true,
      })
      await this.notifyMarketRefresh()
      this.log('info', `${reason} market probe completed: ${formatSnapshot(snapshot)}`)
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
      this.router.abortPendingRequests(`${reason} market probe superseded`)
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
      routeScores: this.router.getScores(),
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
  export interface Config extends MarketProviderConfig {}

  export const Config: Schema<Config> = Schema.object({
    endpoint: Schema.string().role('link').default(DEFAULT_ENDPOINT),
    timeout: Schema.number().role('time').default(Time.second * 30),
    proxyAgent: Schema.string().role('link'),
    autoRoute: Schema.boolean().default(true),
    logLevel: Schema.union(logLevels.map(level => Schema.const(level))).default('warn'),
  })
}

export default MarketProvider

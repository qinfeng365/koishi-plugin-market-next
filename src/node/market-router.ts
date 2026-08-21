import { Context, Dict, HTTP, Time } from 'koishi'
import { createHash } from 'crypto'
import {
  FALLBACK_ENDPOINTS,
  FAST_ROUTE_THRESHOLD,
  ROUTE_STAGGER,
  clamp,
  formatBytes,
  formatError,
  formatRouteScores,
  formatStack,
  formatTime,
  getRouteCooldown,
  normalizeWireSize,
  parseContentLength,
  shortHash,
  type EndpointResult,
  type LogLevel,
  type MarketProviderConfig,
  type PersistedRouteStats,
  type RouteStats,
} from './market-internals'
import { MarketDiskCache } from './market-cache'
import { scoreRouteHealth } from './route-health'

interface MarketRouterOptions {
  isStale: (serial: number) => boolean
  selectEndpoint: (endpoint: string) => void
  onStatsChanged: () => void
  log: (level: Exclude<LogLevel, 'silent'>, message: string) => void
}

export class MarketRouter {
  private stats: Dict<RouteStats> = {}
  private pendingControllers = new Set<AbortController>()

  constructor(
    private ctx: Context,
    private config: MarketProviderConfig,
    private cache: MarketDiskCache,
    private options: MarketRouterOptions,
  ) {}

  async fetchIndex(serial: number): Promise<EndpointResult> {
    const endpoints = this.getEndpoints()
    const rescueEndpoints = this.getRescueEndpoints(endpoints)
    try {
      return await this.fetchIndexFromEndpoints(serial, endpoints)
    } catch (error) {
      if (!rescueEndpoints.length || this.options.isStale(serial) || this.isInternalAbort(error)) throw error
      this.options.log('warn', `market active endpoints failed; retry cooled endpoints as rescue: active=${endpoints.join(', ')}, rescue=${rescueEndpoints.join(', ')}, error=${formatError(error)}`)
      const result = await this.fetchIndexFromEndpoints(serial, rescueEndpoints, { rescue: true })
      result.preferredEndpoint = this.config.endpoint
      result.fallbackReason = 'rescue'
      return result
    }
  }

  getEndpointCandidates() {
    return [this.config.endpoint, ...(this.config.autoRoute === false ? [] : FALLBACK_ENDPOINTS)]
      .filter((endpoint, index, array): endpoint is string => !!endpoint && array.indexOf(endpoint) === index)
  }

  getPreferredEndpoint() {
    return this.config.endpoint!
  }

  getScore(endpoint: string, now = Date.now()) {
    const stats = this.stats[endpoint]
    const cached = this.cache.entries[endpoint]
    let score = endpoint === this.config.endpoint ? 1 : 0
    if (cached) {
      const age = Date.now() - cached.fetchedAt
      score += age <= Time.day ? 1.5 : 0.5
    }
    return scoreRouteHealth(stats, {
      baseScore: score,
      fastThreshold: FAST_ROUTE_THRESHOLD,
      now,
      compressionBonus: true,
    })
  }

  getScores(endpoints = this.getEndpointCandidates()) {
    const now = Date.now()
    return endpoints.map((endpoint) => {
      const stats = this.stats[endpoint]
      const cache = this.cache.entries[endpoint]
      return {
        endpoint,
        score: Math.round(this.getScore(endpoint, now) * 10) / 10,
        successes: stats?.successes,
        failures: stats?.failures,
        consecutiveFailures: stats?.consecutiveFailures,
        cooldownUntil: stats?.cooldownUntil,
        coolingDown: this.isCoolingDown(endpoint),
        averageElapsed: stats?.averageElapsed,
        lastSuccess: stats?.lastSuccess,
        contentEncoding: stats?.contentEncoding,
        cached: !!cache,
        cachedAt: cache?.fetchedAt,
      }
    })
  }

  clearCooldowns(reason: string) {
    for (const stats of Object.values(this.stats)) {
      if (!stats) continue
      stats.cooldownUntil = undefined
      stats.consecutiveFailures = 0
    }
    this.options.log('debug', `market route cooldowns cleared: reason=${reason}`)
    this.options.onStatsChanged()
  }

  restoreStats(persisted: Dict<PersistedRouteStats>) {
    for (const [endpoint, stats] of Object.entries(persisted)) {
      if (!stats) continue
      const hasRecentSuccess = stats.lastSuccess && Date.now() - stats.lastSuccess < Time.day
      this.stats[endpoint] = {
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
  }

  serializeStats(): Dict<PersistedRouteStats> {
    const result: Dict<PersistedRouteStats> = {}
    for (const [endpoint, stats] of Object.entries(this.stats)) {
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

  abortPendingRequests(reason: string) {
    for (const controller of this.pendingControllers) {
      controller.abort(new Error(reason))
    }
    this.pendingControllers.clear()
  }

  private async fetchIndexFromEndpoints(
    serial: number,
    endpoints: string[],
    options: { rescue?: boolean } = {},
  ): Promise<EndpointResult> {
    const routeMode = options.rescue ? 'rescue' : 'active'
    this.options.log('debug', `market endpoint candidates (${routeMode}): ${endpoints.join(', ')}`)
    this.options.log('debug', `market route scores before fetch: ${formatRouteScores(this.getScores(endpoints))}`)
    this.options.log('info', `market endpoint candidates: mode=${routeMode}, primary=${endpoints[0]}, fallbacks=${Math.max(0, endpoints.length - 1)}, autoRoute=${this.config.autoRoute !== false}`)

    if (endpoints.length === 1 || this.config.autoRoute === false) {
      const controller = this.trackController(new AbortController())
      try {
        const result = await this.fetchEndpoint(endpoints[0], 0, endpoints.length, serial, true, controller.signal)
        this.options.selectEndpoint(result.endpoint)
        result.preferredEndpoint = endpoints[0]
        if (options.rescue) result.fallbackReason = 'rescue'
        this.recordSuccess(result)
        return result
      } catch (error) {
        if (!this.options.isStale(serial) && !this.isInternalAbort(error)) {
          this.recordFailure(endpoints[0], { rescue: options.rescue })
        }
        throw error
      } finally {
        this.untrackControllers([controller])
      }
    }

    this.options.log('debug', `fetch primary market endpoint first, primary=${endpoints[0]}, fallbacks=${endpoints.slice(1).join(', ')}, slowThreshold=${FAST_ROUTE_THRESHOLD}ms`)
    this.options.log('info', `market route started: primary=${endpoints[0]}, fallbackCount=${endpoints.length - 1}, slowThreshold=${FAST_ROUTE_THRESHOLD}ms`)
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
          this.options.log('debug', `ignore slower market endpoint ${data.endpoint}, elapsed=${data.elapsed}ms`)
          return
        }
        settled = true
        finish()
        controllers.forEach((controller, controllerIndex) => {
          if (controllerIndex !== index) controller.abort(new Error('market endpoint race settled'))
        })
        this.options.selectEndpoint(data.endpoint)
        data.preferredEndpoint = endpoints[0]
        if (options.rescue) {
          data.fallbackReason = 'rescue'
          this.options.log('debug', `rescue market endpoint selected: endpoint=${data.endpoint}, elapsed=${data.elapsed}ms, configured=${this.config.endpoint}`)
          this.options.log('info', `market rescue endpoint selected: endpoint=${data.endpoint}, elapsed=${data.elapsed}ms, configured=${this.config.endpoint}`)
        } else if (data.endpoint !== this.config.endpoint) {
          data.fallbackReason = fallbackReason
          this.options.log('debug', `fallback endpoint selected: endpoint=${data.endpoint}, reason=${fallbackReason ?? 'unknown'}, elapsed=${data.elapsed}ms`)
          this.options.log('info', `market fallback endpoint selected: endpoint=${data.endpoint}, reason=${fallbackReason ?? 'unknown'}, elapsed=${data.elapsed}ms, primary=${endpoints[0]}`)
        } else {
          this.options.log('info', `market primary endpoint selected: endpoint=${data.endpoint}, elapsed=${data.elapsed}ms, source=${data.source}`)
        }
        this.recordSuccess(data)
        resolve(data)
      }

      const fail = (endpoint: string, index: number, error: any) => {
        if (settled) return
        if (this.options.isStale(serial) || this.isInternalAbort(error)) {
          settled = true
          controllers.forEach(controller => controller.abort(new Error('market endpoint race cancelled')))
          finish()
          reject(error)
          return
        }
        this.recordFailure(endpoint, { rescue: options.rescue })
        lastError = error
        failed++
        if (index === 0) startFallback('primary-failed')
        if (failed < endpoints.length) return
        settled = true
        finish()
        this.options.log('debug', `all market endpoint candidates failed, count=${endpoints.length}`)
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
        this.options.log('debug', `start fallback market endpoint race, reason=${reason}, count=${endpoints.length - 1}, stagger=${ROUTE_STAGGER}ms`)
        this.options.log('info', `market fallback race started: reason=${reason}, count=${endpoints.length - 1}, stagger=${ROUTE_STAGGER}ms`)
        endpoints.slice(1).forEach((endpoint, fallbackIndex) => {
          startEndpoint(endpoint, fallbackIndex + 1, fallbackIndex)
        })
      }

      startEndpoint(endpoints[0], 0)
    })
  }

  private getRescueEndpoints(activeEndpoints: string[]) {
    if (this.config.autoRoute === false) return []
    const active = new Set(activeEndpoints)
    return this.getEndpointCandidates().filter(endpoint => !active.has(endpoint))
  }

  private getEndpoints() {
    const endpoints = this.getEndpointCandidates()
    if (this.config.autoRoute === false) return endpoints
    const [primary, ...fallbacks] = endpoints
    const availableFallbacks = fallbacks.filter((endpoint) => {
      if (!this.isCoolingDown(endpoint)) return true
      this.options.log('debug', `skip cooled market endpoint: endpoint=${endpoint}, until=${formatTime(this.stats[endpoint]?.cooldownUntil)}, failures=${this.stats[endpoint]?.consecutiveFailures ?? 0}`)
      return false
    })
    const originalIndex = new Map(fallbacks.map((endpoint, index) => [endpoint, index]))
    const now = Date.now()
    return [primary, ...availableFallbacks.sort((a, b) => {
      const delta = this.getScore(b, now) - this.getScore(a, now)
      if (delta) return delta
      return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0)
    })]
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

  private recordSuccess(result: EndpointResult) {
    const stats = this.stats[result.endpoint] ||= { score: 0, successes: 0, failures: 0 }
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
    this.options.log('debug', `route success updated: endpoint=${result.endpoint}, elapsed=${result.elapsed}ms, source=${result.source}, score=${stats.score.toFixed(2)}, successes=${stats.successes}, failures=${stats.failures}, average=${Math.round(stats.averageElapsed)}ms, encoding=${stats.contentEncoding ?? 'identity'}`)
    this.options.onStatsChanged()
  }

  private recordFailure(endpoint: string, options: { rescue?: boolean } = {}) {
    const stats = this.stats[endpoint] ||= { score: 0, successes: 0, failures: 0 }
    stats.failures++
    if (options.rescue) {
      stats.score = clamp(stats.score - 0.25, -10, 3)
      this.options.log('debug', `route rescue failure noted without extending cooldown: endpoint=${endpoint}, score=${stats.score.toFixed(2)}, successes=${stats.successes}, failures=${stats.failures}, consecutive=${stats.consecutiveFailures ?? 0}, cooldownUntil=${formatTime(stats.cooldownUntil)}, average=${stats.averageElapsed == null ? '-' : Math.round(stats.averageElapsed) + 'ms'}`)
    } else {
      stats.consecutiveFailures = (stats.consecutiveFailures ?? 0) + 1
      stats.cooldownUntil = Date.now() + getRouteCooldown(stats.consecutiveFailures)
      stats.score = clamp(stats.score - 1.2, -10, 3)
      this.options.log('debug', `route failure updated: endpoint=${endpoint}, score=${stats.score.toFixed(2)}, successes=${stats.successes}, failures=${stats.failures}, consecutive=${stats.consecutiveFailures}, cooldownUntil=${formatTime(stats.cooldownUntil)}, average=${stats.averageElapsed == null ? '-' : Math.round(stats.averageElapsed) + 'ms'}`)
    }
    this.options.onStatsChanged()
  }

  private isCoolingDown(endpoint: string) {
    if (endpoint === this.config.endpoint) return false
    const until = this.stats[endpoint]?.cooldownUntil
    return !!until && Date.now() < until
  }

  private async fetchEndpoint(
    endpoint: string,
    index: number,
    total: number,
    serial: number,
    warnFailure = true,
    signal?: AbortSignal,
  ): Promise<EndpointResult> {
    if (this.options.isStale(serial)) throw new Error('market provider disposed')
    const start = Date.now()
    try {
      const http: HTTP = this.ctx.http.extend({
        ...this.config,
        endpoint,
      })
      const conditional = this.cache.getConditionalHeaders(endpoint)
      const headers = {
        'accept-encoding': 'br,gzip,deflate',
        ...conditional,
      }
      const requestStart = Date.now()
      this.options.log('debug', `fetch market index from ${endpoint} (${index + 1}/${total}), timeout=${this.config.timeout ?? 'default'}, proxy=${this.config.proxyAgent ? 'yes' : 'no'}, compression=yes, conditional=${Object.keys(conditional).length ? 'yes' : 'no'}`)
      this.options.log('debug', `market request headers: endpoint=${endpoint}, acceptEncoding=br,gzip,deflate, etag=${conditional['if-none-match'] ?? '-'}, lastModified=${conditional['if-modified-since'] ?? '-'}`)
      const response = await http<string>('', {
        responseType: 'text',
        headers,
        signal,
        validateStatus: status => status === 304 || status >= 200 && status < 300,
      })
      if (this.options.isStale(serial)) throw new Error('market provider disposed')
      const requestElapsed = Date.now() - requestStart
      const etag = response.headers.get('etag') || undefined
      const lastModified = response.headers.get('last-modified') || undefined
      const contentEncoding = response.headers.get('content-encoding') || undefined
      const headerWireSize = parseContentLength(response.headers.get('content-length'))
      this.options.log('debug', `market response headers: endpoint=${endpoint}, status=${response.status}, request=${requestElapsed}ms, etag=${etag ?? '-'}, lastModified=${lastModified ?? '-'}, encoding=${contentEncoding ?? 'identity'}, contentLength=${formatBytes(headerWireSize)}`)

      const cached = this.cache.entries[endpoint]
      if (response.status === 304) {
        const cache = cached && await this.cache.loadEntry(cached)
        if (!cache) throw new Error(`market index from ${endpoint} returned 304 without cache`)
        const elapsed = Date.now() - start
        const validatedAt = Date.now()
        this.options.log('debug', `market index not modified from ${endpoint} in ${elapsed}ms, reuse cache hash=${shortHash(cache.hash) || 'unknown'}`)
        this.options.log('info', `market index http-304: endpoint=${endpoint}, elapsed=${elapsed}ms, request=${requestElapsed}ms, cachedAt=${formatTime(cache.fetchedAt)}, hash=${shortHash(cache.hash) || 'unknown'}`)
        return {
          endpoint,
          result: cache.result,
          elapsed,
          candidates: total,
          source: 'http-304',
          timings: { request: requestElapsed, total: elapsed },
          size: cache.size,
          wireSize: headerWireSize ?? cache.wireSize,
          contentEncoding: contentEncoding ?? cache.contentEncoding,
          hash: cache.hash,
          etag: etag || cache.etag,
          lastModified: lastModified || cache.lastModified,
          cachedAt: cache.fetchedAt,
          validatedAt,
        }
      }

      const text = response.data
      const size = Buffer.byteLength(text)
      const wireSize = normalizeWireSize(headerWireSize, size)
      this.options.log('debug', `market response body decoded: endpoint=${endpoint}, chars=${text.length}, decodedSize=${formatBytes(size)}, wireSize=${formatBytes(wireSize)}, cachedHash=${shortHash(cached?.hash) ?? '-'}, cachedAt=${cached?.fetchedAt ? formatTime(cached.fetchedAt) : '-'}`)
      const hashStart = Date.now()
      const hash = createHash('sha256').update(text).digest('hex')
      const hashElapsed = Date.now() - hashStart
      this.options.log('debug', `market response hash computed: endpoint=${endpoint}, hash=${shortHash(hash) || 'unknown'}, elapsed=${hashElapsed}ms, unchanged=${!!cached && cached.hash === hash}`)

      const hashCache = cached && cached.hash === hash ? await this.cache.loadEntry(cached) : undefined
      if (hashCache) {
        const elapsed = Date.now() - start
        const validatedAt = Date.now()
        this.options.log('debug', `market index hash unchanged from ${endpoint} in ${elapsed}ms, size=${size}, hash=${shortHash(hash)}`)
        this.options.log('info', `market index hash-cache: endpoint=${endpoint}, elapsed=${elapsed}ms, request=${requestElapsed}ms, hash=${shortHash(hash)}, size=${formatBytes(size)}, wireSize=${formatBytes(wireSize)}, encoding=${contentEncoding ?? 'identity'}`)
        return {
          endpoint,
          result: hashCache.result,
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
          cachedAt: hashCache.fetchedAt,
          validatedAt,
        }
      }
      if (cached && cached.hash === hash) {
        this.options.log('debug', `market cache hash matched but cached result is unavailable, parse network body instead: endpoint=${endpoint}, hash=${shortHash(hash)}`)
      }

      const parseStart = Date.now()
      this.options.log('debug', `market json parse started: endpoint=${endpoint}, decodedSize=${formatBytes(size)}`)
      const result = JSON.parse(text)
      const parseElapsed = Date.now() - parseStart
      if (!Array.isArray(result?.objects)) throw new Error(`invalid market index from ${endpoint}`)
      this.options.log('debug', `market json parse completed: endpoint=${endpoint}, objects=${result.objects.length}, version=${result.version ?? 'legacy'}, elapsed=${parseElapsed}ms`)
      const elapsed = Date.now() - start
      this.options.log('debug', `market index fetched from ${endpoint} in ${elapsed}ms, objects=${result.objects.length}, size=${size}, wireSize=${wireSize ?? 'unknown'}, encoding=${contentEncoding ?? 'identity'}, hash=${shortHash(hash) || 'unknown'}, version=${result.version ?? 'legacy'}`)
      this.options.log('info', `market index fetched: endpoint=${endpoint}, elapsed=${elapsed}ms, request=${requestElapsed}ms, hash=${hashElapsed}ms, json=${parseElapsed}ms, objects=${result.objects.length}, size=${formatBytes(size)}, wireSize=${formatBytes(wireSize)}, encoding=${contentEncoding ?? 'identity'}, hash=${shortHash(hash) || 'unknown'}, version=${result.version ?? 'legacy'}`)
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
      if (this.options.isStale(serial)) throw new Error('market provider disposed')
      this.options.log(warnFailure ? 'warn' : 'debug', `failed to fetch market index from ${endpoint} in ${Date.now() - start}ms: ${formatError(error)}`)
      this.options.log('debug', `market endpoint error detail: endpoint=${endpoint}, index=${index + 1}/${total}, warn=${warnFailure}, elapsed=${Date.now() - start}ms, stack=${formatStack(error)}`)
      throw error
    }
  }

  private trackController(controller: AbortController) {
    this.pendingControllers.add(controller)
    return controller
  }

  private untrackControllers(controllers: AbortController[]) {
    for (const controller of controllers) this.pendingControllers.delete(controller)
  }

  private isInternalAbort(error: any) {
    const message = error instanceof Error ? error.message : String(error)
    return /race settled|stale|disposed|aborted|abort/i.test(message)
  }
}

import { Context, Dict, Time } from 'koishi'
import {
  FALLBACK_ENDPOINTS,
  FAST_ROUTE_THRESHOLD,
  MARKET_GENERATION_TOLERANCE,
  ROUTE_STAGGER,
  clamp,
  formatError,
  formatRouteScores,
  formatTime,
  getMarketGenerationTime,
  getRouteCooldown,
  type EndpointResult,
  type LogLevel,
  type MarketProviderConfig,
  type PersistedRouteStats,
  type RouteStats,
} from './market-internals'
import { MarketDiskCache } from './market-cache'
import { MarketEndpointFetcher } from './market-fetcher'
import {
  MarketVersionResolver,
  getVersionedMarketIndexUrl,
  getVersionedMarketSource,
} from './market-version'
import { scoreRouteHealth } from './route-health'

class StaleMarketIndexError extends Error {}

interface MarketRouterOptions {
  isStale: (serial: number) => boolean
  selectEndpoint: (endpoint: string) => void
  onStatsChanged: () => void
  log: (level: Exclude<LogLevel, 'silent'>, message: string) => void
}

interface SpeculativeMarketFetch {
  controller: AbortController
  task: Promise<void>
  done: boolean
  result?: EndpointResult
  error?: unknown
}

export class MarketRouter {
  private stats: Dict<RouteStats> = {}
  private pendingControllers = new Set<AbortController>()
  private fetcher: MarketEndpointFetcher
  private versionResolver: MarketVersionResolver

  constructor(
    private ctx: Context,
    private config: MarketProviderConfig,
    private cache: MarketDiskCache,
    private options: MarketRouterOptions,
  ) {
    this.fetcher = new MarketEndpointFetcher(ctx, config, cache, {
      isStale: options.isStale,
      log: options.log,
    })
    this.versionResolver = new MarketVersionResolver(ctx, config, options.log)
  }

  async fetchIndex(serial: number): Promise<EndpointResult> {
    const endpoints = this.getEndpoints()
    if (this.config.autoRoute !== false && getVersionedMarketSource(this.config.endpoint!)) {
      const versioned = await this.fetchVersionedIndex(serial, endpoints)
      if (versioned) return versioned
    }
    return this.fetchDirectIndex(serial, endpoints)
  }

  private async fetchDirectIndex(serial: number, endpoints: string[]) {
    const rescueEndpoints = this.getRescueEndpoints(endpoints)
    const minimumGeneration = await this.cache.getLatestGeneration(this.getEndpointCandidates())
    try {
      return await this.fetchIndexFromEndpoints(serial, endpoints, { minimumGeneration })
    } catch (error) {
      if (!rescueEndpoints.length || this.options.isStale(serial) || this.isInternalAbort(error)) throw error
      this.options.log('warn', `market active endpoints failed; retry cooled endpoints as rescue: active=${endpoints.join(', ')}, rescue=${rescueEndpoints.join(', ')}, error=${formatError(error)}`)
      const result = await this.fetchIndexFromEndpoints(serial, rescueEndpoints, { rescue: true, minimumGeneration })
      result.preferredEndpoint = this.config.endpoint
      result.fallbackReason = 'rescue'
      return result
    }
  }

  private async fetchVersionedIndex(serial: number, endpoints: string[]) {
    const versionedEndpoints = endpoints.filter(endpoint => !!getVersionedMarketSource(endpoint))
    if (!versionedEndpoints.length) return
    const hasCache = this.getEndpointCandidates().some(endpoint => !!this.cache.entries[endpoint])
    const speculative = hasCache ? undefined : this.startSpeculativeIndex(serial, versionedEndpoints)
    const controller = this.trackController(new AbortController())
    let resolution
    try {
      resolution = await this.versionResolver.resolve(versionedEndpoints, controller.signal)
    } catch (error) {
      speculative?.controller.abort(new Error('market version discovery failed'))
      throw error
    } finally {
      this.untrackControllers([controller])
    }
    if (this.options.isStale(serial)) {
      speculative?.controller.abort(new Error('market version discovery unavailable'))
      return
    }
    if (!resolution) {
      if (speculative && !speculative.done) {
        await Promise.race([
          speculative.task,
          new Promise(resolve => setTimeout(resolve, 300)),
        ])
      }
      if (speculative?.result) {
        this.commitResult(speculative.result)
        this.options.log('warn', `market version witnesses unavailable; use speculative direct index: endpoint=${speculative.result.endpoint}, hash=${speculative.result.hash?.slice(0, 12) ?? '-'}`)
        return speculative.result
      }
      speculative?.controller.abort(new Error('market version discovery unavailable'))
      return
    }

    if (speculative && !speculative.done) {
      await Promise.race([
        speculative.task,
        new Promise(resolve => setTimeout(resolve, 150)),
      ])
    }
    if (speculative?.result?.hash === resolution.hash) {
      speculative.result.timings.version = resolution.elapsed
      this.commitResult(speculative.result)
      this.options.log('info', `market speculative index matched resolved version: endpoint=${speculative.result.endpoint}, hash=${resolution.hash.slice(0, 12)}, version=${resolution.elapsed}ms, request=${speculative.result.elapsed}ms`)
      return speculative.result
    }
    if (speculative) {
      speculative.controller.abort(new Error('market speculative index did not match resolved version'))
      if (speculative.result) {
        this.options.log('warn', `discard stale speculative market index: endpoint=${speculative.result.endpoint}, received=${speculative.result.hash?.slice(0, 12) ?? '-'}, expected=${resolution.hash.slice(0, 12)}`)
      }
    }

    const candidates = this.getEndpointCandidates()
    const minimumGeneration = await this.cache.getLatestGeneration(candidates)
    const cached = await this.cache.findByHash(resolution.hash, candidates)
    if (cached) {
      const validatedAt = Date.now()
      const result: EndpointResult = {
        endpoint: cached.endpoint,
        preferredEndpoint: this.config.endpoint,
        result: cached.result,
        elapsed: resolution.elapsed,
        candidates: resolution.candidates,
        source: 'hash-cache' as const,
        timings: { version: resolution.elapsed, total: resolution.elapsed },
        size: cached.size,
        wireSize: cached.wireSize,
        contentEncoding: cached.contentEncoding,
        hash: cached.hash,
        etag: cached.etag,
        lastModified: cached.lastModified,
        cachedAt: cached.fetchedAt,
        validatedAt,
      }
      try {
        this.assertGeneration(result, minimumGeneration)
      } catch (error) {
        this.options.log('warn', `ignore regressed market version witness: hash=${resolution.hash.slice(0, 12)}, endpoint=${cached.endpoint}, error=${formatError(error)}`)
        return
      }
      this.options.selectEndpoint(cached.endpoint)
      this.options.log('info', `market version cache hit: endpoint=${cached.endpoint}, hash=${resolution.hash.slice(0, 12)}, witnesses=${resolution.witnesses.join(', ')}, elapsed=${resolution.elapsed}ms`)
      return result
    }

    try {
      const result = await this.fetchIndexFromEndpoints(serial, versionedEndpoints, {
        expectedHash: resolution.hash,
        minimumGeneration,
      })
      result.timings.version = resolution.elapsed
      return result
    } catch (error) {
      if (this.options.isStale(serial) || this.isInternalAbort(error)) throw error
      this.options.log('warn', `market content-addressed routes failed; fall back to direct endpoints: hash=${resolution.hash.slice(0, 12)}, endpoints=${versionedEndpoints.join(', ')}, error=${formatError(error)}`)
    }
  }

  private startSpeculativeIndex(serial: number, endpoints: string[]) {
    const t4wefan = 'https://registry.koishi.t4wefan.pub/index.json'
    const candidates = [endpoints[0], endpoints.includes(t4wefan) ? t4wefan : undefined]
      .filter((endpoint, index, array): endpoint is string => !!endpoint && array.indexOf(endpoint) === index)
    const controller = this.trackController(new AbortController())
    const state: SpeculativeMarketFetch = {
      controller,
      task: Promise.resolve(),
      done: false,
    }
    state.task = this.fetchIndexFromEndpoints(serial, candidates, {
      deferCommit: true,
      suppressStats: true,
      signal: controller.signal,
    }).then((result) => {
      state.result = result
    }, (error) => {
      state.error = error
    }).finally(() => {
      state.done = true
      this.untrackControllers([controller])
    })
    return state
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
    options: {
      rescue?: boolean
      expectedHash?: string
      minimumGeneration?: number
      deferCommit?: boolean
      suppressStats?: boolean
      signal?: AbortSignal
    } = {},
  ): Promise<EndpointResult> {
    const routeMode = options.rescue ? 'rescue' : 'active'
    this.options.log('debug', `market endpoint candidates (${routeMode}): ${endpoints.join(', ')}`)
    this.options.log('debug', `market route scores before fetch: ${formatRouteScores(this.getScores(endpoints))}`)
    this.options.log('info', `market endpoint candidates: mode=${routeMode}, primary=${endpoints[0]}, fallbacks=${Math.max(0, endpoints.length - 1)}, autoRoute=${this.config.autoRoute !== false}`)

    if (endpoints.length === 1 || this.config.autoRoute === false) {
      const controller = this.trackController(new AbortController())
      const unbindAbort = this.bindAbort(options.signal, [controller])
      try {
        const result = await this.fetcher.fetch({
          endpoint: endpoints[0],
          requestUrl: options.expectedHash
            ? getVersionedMarketIndexUrl(endpoints[0], options.expectedHash)
            : undefined,
          expectedHash: options.expectedHash,
          index: 0,
          total: endpoints.length,
          serial,
          warnFailure: true,
          signal: controller.signal,
        })
        this.assertGeneration(result, options.minimumGeneration)
        result.preferredEndpoint = endpoints[0]
        if (options.rescue) result.fallbackReason = 'rescue'
        if (!options.deferCommit) this.commitResult(result)
        return result
      } catch (error) {
        if (!options.suppressStats && !this.options.isStale(serial) && !this.isInternalAbort(error) && !(error instanceof StaleMarketIndexError)) {
          this.recordFailure(endpoints[0], { rescue: options.rescue })
        }
        throw error
      } finally {
        unbindAbort()
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
      const unbindAbort = this.bindAbort(options.signal, controllers)
      const timer = setTimeout(() => startFallback('primary-slow'), FAST_ROUTE_THRESHOLD)

      const finish = () => {
        clearTimeout(timer)
        unbindAbort()
        this.untrackControllers(controllers)
      }

      const settle = (data: EndpointResult, index: number) => {
        if (settled) {
          this.options.log('debug', `ignore slower market endpoint ${data.endpoint}, elapsed=${data.elapsed}ms`)
          return
        }
        try {
          this.assertGeneration(data, options.minimumGeneration)
        } catch (error) {
          fail(data.endpoint, index, error, false, 'primary-stale')
          return
        }
        settled = true
        finish()
        controllers.forEach((controller, controllerIndex) => {
          if (controllerIndex !== index) controller.abort(new Error('market endpoint race settled'))
        })
        data.preferredEndpoint = endpoints[0]
        if (options.rescue) {
          data.fallbackReason = 'rescue'
        } else if (data.endpoint !== this.config.endpoint) {
          data.fallbackReason = fallbackReason
        }
        if (!options.deferCommit) this.commitResult(data)
        resolve(data)
      }

      const fail = (
        endpoint: string,
        index: number,
        error: any,
        penalize = true,
        primaryReason: NonNullable<EndpointResult['fallbackReason']> = 'primary-failed',
      ) => {
        if (settled) return
        if (this.options.isStale(serial) || this.isInternalAbort(error)) {
          settled = true
          controllers.forEach(controller => controller.abort(new Error('market endpoint race cancelled')))
          finish()
          reject(error)
          return
        }
        if (penalize && !options.suppressStats) this.recordFailure(endpoint, { rescue: options.rescue })
        lastError = error
        failed++
        if (index === 0) startFallback(primaryReason)
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
          return this.fetcher.fetch({
            endpoint,
            requestUrl: options.expectedHash
              ? getVersionedMarketIndexUrl(endpoint, options.expectedHash)
              : undefined,
            expectedHash: options.expectedHash,
            index,
            total: endpoints.length,
            serial,
            warnFailure: false,
            signal,
          })
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

  private bindAbort(signal: AbortSignal | undefined, controllers: AbortController[]) {
    if (!signal) return () => {}
    const abort = () => {
      for (const controller of controllers) {
        controller.abort(signal.reason ?? new Error('market endpoint request aborted'))
      }
    }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    return () => signal.removeEventListener('abort', abort)
  }

  private commitResult(result: EndpointResult) {
    this.options.selectEndpoint(result.endpoint)
    if (result.fallbackReason === 'rescue') {
      this.options.log('debug', `rescue market endpoint selected: endpoint=${result.endpoint}, elapsed=${result.elapsed}ms, configured=${this.config.endpoint}`)
      this.options.log('info', `market rescue endpoint selected: endpoint=${result.endpoint}, elapsed=${result.elapsed}ms, configured=${this.config.endpoint}`)
    } else if (result.endpoint !== this.config.endpoint) {
      this.options.log('debug', `fallback endpoint selected: endpoint=${result.endpoint}, reason=${result.fallbackReason ?? 'unknown'}, elapsed=${result.elapsed}ms`)
      this.options.log('info', `market fallback endpoint selected: endpoint=${result.endpoint}, reason=${result.fallbackReason ?? 'unknown'}, elapsed=${result.elapsed}ms, primary=${result.preferredEndpoint ?? this.config.endpoint}`)
    } else {
      this.options.log('info', `market primary endpoint selected: endpoint=${result.endpoint}, elapsed=${result.elapsed}ms, source=${result.source}`)
    }
    this.recordSuccess(result)
  }

  private assertGeneration(result: EndpointResult, minimumGeneration?: number) {
    if (minimumGeneration == null) return
    const generation = getMarketGenerationTime(result.result)
    if (generation != null && generation + MARKET_GENERATION_TOLERANCE >= minimumGeneration) return
    const actual = generation == null ? 'unknown' : formatTime(generation)
    const minimum = formatTime(minimumGeneration)
    this.options.log('warn', `reject stale market index: endpoint=${result.endpoint}, generation=${actual}, minimum=${minimum}, hash=${result.hash?.slice(0, 12) ?? '-'}`)
    throw new StaleMarketIndexError(`market index from ${result.endpoint} is stale (${actual} < ${minimum})`)
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

  private trackController(controller: AbortController) {
    this.pendingControllers.add(controller)
    return controller
  }

  private untrackControllers(controllers: AbortController[]) {
    for (const controller of controllers) this.pendingControllers.delete(controller)
  }

  private isInternalAbort(error: any) {
    if (error instanceof StaleMarketIndexError) return false
    const message = error instanceof Error ? error.message : String(error)
    return /race settled|stale|disposed|aborted|abort/i.test(message)
  }
}

import { Context, Dict, HTTP, Logger, Time } from 'koishi'
import Scanner, { DependencyMetaKey, Registry, RemotePackage } from '@koishijs/registry'
import { promises as fsp } from 'fs'
import { resolve } from 'path'
import getRegistry from 'get-registry'
import { satisfies } from 'semver'
import {
  allRegistryAttemptsNotFound,
  getRegistryAttemptReasons,
  shouldPenalizeRegistryRoute,
  type RegistryStatus,
} from '../shared'
import {
  getVersions,
  sleep,
  type InstallFallbackCandidate,
  type InstallerConfig,
} from './installer-types'

const logger = new Logger('market')
const REGISTRY_FALLBACK_ENDPOINTS = [
  'https://registry.npmmirror.com',
  'https://mirrors.cloud.tencent.com/npm',
  'https://mirrors.huaweicloud.com/repository/npm',
  'https://registry.npmjs.org',
  'https://r.cnpmjs.org',
]
const REGISTRY_ROUTE_STAGGER = 120
const REGISTRY_FAST_ROUTE_THRESHOLD = Time.second * 0.8
const REGISTRY_STATS_TTL = Time.day * 30
const NOT_FOUND_CACHE_TTL = Time.minute * 5

interface PersistedRegistryStats {
  score: number
  successes?: number
  failures?: number
  consecutiveFailures?: number
  averageElapsed?: number
  lastSuccess?: number
  lastFailure?: number
  lastFailureReason?: RegistryStatus['reason']
}

interface RegistryStatsStore {
  version: 1
  stats: Dict<PersistedRegistryStats>
  savedAt: number
}

interface RouteStats {
  score: number
  successes: number
  failures: number
  consecutiveFailures?: number
  averageElapsed?: number
  lastSuccess?: number
  lastFailure?: number
  lastFailureReason?: RegistryStatus['reason']
}

interface RegistryEndpointResult {
  endpoint: string
  registry: Registry
  elapsed: number
  fallbackReason?: 'primary-failed' | 'primary-slow'
}

interface RegistryRouteResult extends RegistryEndpointResult {
  attempts: number
  lastEndpoint: string
}

export class RegistryMetadata {
  http: HTTP
  endpoint: string
  fullCache: Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>> = {}
  registryStatus: Dict<RegistryStatus> = {}

  tempCache: Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>> = {}
  private pkgTasks: Dict<Promise<Dict<Pick<RemotePackage, DependencyMetaKey>> | undefined>> = {}
  private metadataEndpoint: string
  private routeProbeTask?: Promise<void>
  private routeProbeResult?: {
    serial: number
    name: string
    endpoint: string
    registry: Registry
    elapsed: number
    fallbackReason?: RegistryEndpointResult['fallbackReason']
  }
  private routeStats: Dict<RouteStats> = {}
  private notFoundCache: Dict<number> = {}
  private statsFile: string
  private statsWriteTimer?: ReturnType<typeof setTimeout>
  private flushData: () => void
  private tempRegistryStatus: Dict<RegistryStatus> = {}
  private flushRegistryStatus: () => void
  private pendingControllers = new Set<AbortController>()
  private currentSerial = 0

  constructor(private ctx: Context, private config: InstallerConfig) {
    this.statsFile = resolve(ctx.baseDir, 'cache', 'market-next-registry-stats.json')
    this.flushData = ctx.throttle(() => {
      ctx.get('console')?.broadcast('market/registry', this.tempCache)
      this.tempCache = {}
    }, 500)
    this.flushRegistryStatus = ctx.throttle(() => {
      ctx.get('console')?.broadcast('market/registry-status', { ...this.tempRegistryStatus })
      this.tempRegistryStatus = {}
    }, 200)
  }

  get serial() {
    return this.currentSerial
  }

  get selectedEndpoint() {
    return this.metadataEndpoint || this.endpoint
  }

  get hasRouteProbeResult() {
    return !!this.routeProbeResult
  }

  async restoreRouteStats() {
    await this.loadRouteStats()
  }

  async initializeEndpoint() {
    await this.resetEndpoint()
  }

  async reset(reason: string) {
    this.currentSerial++
    this.abortPendingRequests(reason)
    await this.resetEndpoint()
    this.pkgTasks = {}
    this.fullCache = {}
    this.tempCache = {}
    this.clearRegistryStatus()
  }

  dispose() {
    clearTimeout(this.statsWriteTimer)
    this.abortPendingRequests('installer disposed')
  }

  hasRecentNotFound(name: string) {
    const timestamp = this.notFoundCache[name]
    return !!timestamp && Date.now() - timestamp < NOT_FOUND_CACHE_TTL
  }

  async ensureEndpoint(name: string, serial = this.currentSerial) {
    const endpoints = this.getRouteProbeEndpoints()
    if (!name || endpoints.length <= 1) return
    if (!this.routeProbeTask) {
      this.routeProbeTask = this.probeMetadataEndpoint(name, endpoints, serial)
    }
    await this.routeProbeTask
  }

  async getRegistry(name: string, serial = this.currentSerial) {
    const start = Date.now()
    const maxRetry = Math.max(0, this.config.retry ?? 1)
    let attempts = 0
    let lastError: any
    let lastEndpoint = this.selectedEndpoint
    const failureReasons: RegistryStatus['reason'][] = []
    this.setRegistryStatus(name, {
      loading: true,
      error: undefined,
      reason: undefined,
      endpoint: lastEndpoint,
      attempts,
      elapsed: undefined,
    }, serial)

    await this.ensureEndpoint(name, serial)
    if (this.isStale(serial)) return

    const probe = this.routeProbeResult
    if (probe?.serial === serial && probe.name === name && probe.endpoint === this.metadataEndpoint) {
      attempts = 1
      this.setRegistryStatus(name, {
        loading: false,
        error: undefined,
        reason: undefined,
        endpoint: probe.endpoint,
        attempts,
        elapsed: Date.now() - start,
      }, serial)
      logger.debug(`reuse npm registry route probe payload for ${name}: endpoint=${probe.endpoint}, probeElapsed=${probe.elapsed}ms`)
      return probe.registry
    }

    for (let retry = 0; retry <= maxRetry; retry++) {
      const endpoints = this.getRegistryEndpoints()
      logger.debug(`registry metadata candidates for ${name}: endpoints=${endpoints.join(', ')}, retry=${retry + 1}/${maxRetry + 1}, concurrency=${this.config.concurrency ?? 4}`)
      try {
        const result = await this.fetchRegistryByRoute(name, endpoints, serial, (endpoint) => {
          attempts++
          lastEndpoint = endpoint
          this.setRegistryStatus(name, { loading: true, endpoint, attempts }, serial)
        })
        if (this.isStale(serial)) return
        if (result.endpoint !== this.metadataEndpoint) {
          logger.debug(`routed npm registry endpoint for ${name}: ${result.endpoint}`)
          logger.info(`npm registry route selected for ${name}: endpoint=${result.endpoint}, previous=${this.metadataEndpoint}, reason=${result.fallbackReason ?? 'same-priority'}, elapsed=${result.elapsed}ms`)
          this.metadataEndpoint = result.endpoint
        }
        this.setRegistryStatus(name, {
          loading: false,
          error: undefined,
          reason: undefined,
          endpoint: result.endpoint,
          attempts,
          elapsed: Date.now() - start,
        }, serial)
        logger.debug(`loaded registry metadata for ${name} from ${result.endpoint} in ${result.elapsed}ms, attempts=${attempts}, versions=${Object.keys(result.registry.versions).length}`)
        return result.registry
      } catch (error) {
        lastError = error
        const detail = this.formatError(error)
        failureReasons.push(...getRegistryAttemptReasons(error, detail.reason) as RegistryStatus['reason'][])
        logger.debug(`failed routed registry metadata for ${name}, attempt=${retry + 1}/${maxRetry + 1}, endpoint=${lastEndpoint}, attempts=${attempts}: ${detail.error}`)
        if (retry < maxRetry) await sleep(300 * (retry + 1))
      }
    }

    const detail = this.formatError(lastError)
    const finalDetail = allRegistryAttemptsNotFound(failureReasons)
      ? detail
      : failureReasons.some(reason => reason !== 'not-found')
        ? { reason: failureReasons.find(reason => reason !== 'not-found')!, error: detail.error }
        : detail
    this.setRegistryStatus(name, {
      loading: false,
      reason: finalDetail.reason,
      error: finalDetail.error,
      endpoint: lastEndpoint,
      attempts,
      elapsed: Date.now() - start,
    }, serial)
    logger.warn(`failed to fetch registry metadata for ${name}: ${detail.error}`)
    if (lastError && typeof lastError === 'object') {
      Object.defineProperty(lastError, 'marketNextReason', {
        value: finalDetail.reason,
        configurable: true,
      })
      Object.defineProperty(lastError, 'marketNextReasons', {
        value: failureReasons,
        configurable: true,
      })
    }
    throw lastError ?? Object.assign(new Error(finalDetail.error), { marketNextReason: finalDetail.reason })
  }

  setPackage(name: string, versions: RemotePackage[]) {
    this.fullCache[name] = this.tempCache[name] = getVersions(versions)
    this.flushData()
    this.pkgTasks[name] = Promise.resolve(this.fullCache[name])
  }

  getPackage(name: string) {
    const notFoundAt = this.notFoundCache[name]
    if (notFoundAt && Date.now() - notFoundAt < NOT_FOUND_CACHE_TTL) {
      return Promise.resolve(undefined)
    }
    if (notFoundAt) delete this.notFoundCache[name]
    if (!this.pkgTasks[name]) {
      const task = this.fetchPackage(name, this.currentSerial)
      this.pkgTasks[name] = task
      task.then((versions) => {
        if (this.pkgTasks[name] !== task) return
        if (!versions) delete this.pkgTasks[name]
      }, (error) => {
        if (this.pkgTasks[name] !== task) return
        delete this.pkgTasks[name]
        const reason = this.formatError(error).reason
        if (reason === 'not-found') this.notFoundCache[name] = Date.now()
      })
    }
    return this.pkgTasks[name]
  }

  getInstallFallbackCandidate(failedEndpoint?: string): InstallFallbackCandidate | undefined {
    if (this.config.autoRoute === false) return
    const normalize = (endpoint?: string) => endpoint?.replace(/\/+$/, '')
    const failed = normalize(failedEndpoint || this.endpoint)
    const candidates = this.getRegistryEndpointCandidates()
      .filter(endpoint => normalize(endpoint) !== failed)
      .filter(endpoint => normalize(endpoint) !== normalize(this.config.endpoint))
      .map((endpoint, index) => ({
        endpoint,
        index,
        score: this.getRouteScore(endpoint),
        stats: this.routeStats[endpoint],
      }))
      .sort((a, b) => {
        const delta = b.score - a.score
        if (delta) return delta
        const successDelta = (b.stats?.lastSuccess ?? 0) - (a.stats?.lastSuccess ?? 0)
        if (successDelta) return successDelta
        return a.index - b.index
      })
    const candidate = candidates[0]
    if (!candidate) return
    return {
      endpoint: candidate.endpoint,
      label: formatEndpointHost(candidate.endpoint),
      reason: candidate.stats?.lastSuccess ? '最近可用的备用 npm 源' : '备用 npm 源',
    }
  }

  isStale(serial: number) {
    return serial !== this.currentSerial || !this.ctx.scope.isActive
  }

  formatError(error: any): Required<Pick<RegistryStatus, 'reason' | 'error'>> {
    if (error?.marketNextReason) {
      return {
        reason: error.marketNextReason,
        error: error instanceof Error ? error.message : String(error),
      }
    }
    const message = error instanceof Error ? error.message : String(error)
    if (this.ctx.http.isError(error)) {
      const status = (error as any).response?.status
      if (status === 404) return { reason: 'not-found', error: 'npm 元数据不存在，或当前镜像尚未同步该包。' }
      if (status) return { reason: 'http', error: `npm 元数据请求失败，HTTP ${status}。` }
    }
    if (/timeout|ETIMEDOUT|ECONNABORTED/i.test(message)) {
      return { reason: 'timeout', error: 'npm 元数据请求超时。' }
    }
    if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|network/i.test(message)) {
      return { reason: 'network', error: 'npm 元数据请求网络失败。' }
    }
    if (/invalid registry metadata/i.test(message)) {
      return { reason: 'invalid', error: 'npm 元数据格式异常。' }
    }
    return { reason: 'unknown', error: message || 'npm 元数据请求失败。' }
  }

  private createHttp(endpoint: string): HTTP {
    return this.ctx.http.extend({
      endpoint,
      timeout: this.config.timeout,
    })
  }

  private async loadRouteStats() {
    try {
      const content = await fsp.readFile(this.statsFile, 'utf8')
      const store: RegistryStatsStore = JSON.parse(content)
      if (store?.version !== 1 || !store.stats) return
      if (Date.now() - store.savedAt > REGISTRY_STATS_TTL) return
      for (const [endpoint, stats] of Object.entries(store.stats)) {
        if (!stats) continue
        const successes = Math.max(0, Number(stats.successes) || 0)
        const failures = Math.max(0, Number(stats.failures) || 0)
        const hasRecentSuccess = Number(stats.lastSuccess) && Date.now() - Number(stats.lastSuccess) < Time.day
        this.routeStats[endpoint] = {
          score: hasRecentSuccess ? clamp(stats.score, -1, 3) : clamp(stats.score, -4, 3),
          successes,
          failures: hasRecentSuccess ? Math.min(failures, Math.max(2, Math.ceil(successes / 2))) : Math.min(failures, 12),
          consecutiveFailures: hasRecentSuccess ? 0 : Math.max(0, Number(stats.consecutiveFailures) || 0),
          averageElapsed: stats.averageElapsed,
          lastSuccess: stats.lastSuccess,
          lastFailure: stats.lastFailure,
          lastFailureReason: stats.lastFailureReason,
        }
      }
      logger.debug(`npm registry route stats restored from disk: ${Object.keys(store.stats).join(', ')}`)
    } catch (error) {
      if ((error as any)?.code !== 'ENOENT') logger.debug(`failed to load registry route stats: ${error instanceof Error ? error.message : error}`)
    }
  }

  private scheduleStatsWrite() {
    clearTimeout(this.statsWriteTimer)
    this.statsWriteTimer = setTimeout(async () => {
      this.statsWriteTimer = undefined
      if (!this.ctx.scope.isActive) return
      const stats: Dict<PersistedRegistryStats> = {}
      for (const [endpoint, value] of Object.entries(this.routeStats)) {
        if (!value) continue
        stats[endpoint] = {
          score: clamp(value.score, -6, 3),
          successes: value.successes,
          failures: value.failures,
          consecutiveFailures: value.consecutiveFailures,
          averageElapsed: value.averageElapsed,
          lastSuccess: value.lastSuccess,
          lastFailure: value.lastFailure,
          lastFailureReason: value.lastFailureReason,
        }
      }
      try {
        await fsp.mkdir(resolve(this.statsFile, '..'), { recursive: true })
        await fsp.writeFile(this.statsFile, JSON.stringify({ version: 1, stats, savedAt: Date.now() } satisfies RegistryStatsStore))
      } catch (error) {
        logger.debug(`failed to write registry route stats: ${error instanceof Error ? error.message : error}`)
      }
    }, 2000)
  }

  private async resetEndpoint() {
    const endpoint = this.config.endpoint || await getRegistry()
    const previous = this.endpoint
    this.endpoint = endpoint
    this.metadataEndpoint = endpoint
    this.routeProbeTask = undefined
    this.routeProbeResult = undefined
    this.http = this.createHttp(endpoint)
    if (previous && previous !== endpoint) {
      this.routeStats = {}
      logger.info(`npm registry endpoint changed: previous=${previous}, current=${endpoint}, routeStats=reset`)
    }
  }

  private getRegistryEndpoints() {
    const preferred = this.getPreferredMetadataEndpoint()
    return [preferred, ...this.getRouteProbeEndpoints()]
      .filter((endpoint, index, array): endpoint is string => !!endpoint && array.indexOf(endpoint) === index)
  }

  private getPreferredMetadataEndpoint() {
    const endpoint = this.metadataEndpoint || this.endpoint
    if (endpoint === this.endpoint) return endpoint
    const stats = this.routeStats[endpoint]
    if (!stats) return endpoint
    const primaryScore = this.getRouteScore(this.endpoint)
    const selectedScore = this.getRouteScore(endpoint)
    if (stats.failures >= 2 && selectedScore + 1 < primaryScore) {
      logger.debug(`demote npm metadata endpoint: selected=${endpoint}, selectedScore=${selectedScore.toFixed(1)}, primary=${this.endpoint}, primaryScore=${primaryScore.toFixed(1)}, failures=${stats.failures}, lastFailure=${stats.lastFailureReason ?? '-'}`)
      return this.endpoint
    }
    return endpoint
  }

  private getRegistryEndpointCandidates() {
    return [this.endpoint, ...(this.config.autoRoute === false ? [] : REGISTRY_FALLBACK_ENDPOINTS)]
      .filter((endpoint, index, array): endpoint is string => !!endpoint && array.indexOf(endpoint) === index)
  }

  private getRouteProbeEndpoints() {
    const endpoints = this.getRegistryEndpointCandidates()
    if (this.config.autoRoute === false) return endpoints
    const [primary, ...fallbacks] = endpoints
    const originalIndex = new Map(fallbacks.map((endpoint, index) => [endpoint, index]))
    return [primary, ...fallbacks.sort((a, b) => {
      const delta = this.getRouteScore(b) - this.getRouteScore(a)
      if (delta) return delta
      return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0)
    })]
  }

  private raceEndpoints(
    name: string,
    endpoints: string[],
    serial: number,
    onAttempt?: (endpoint: string) => void,
  ): Promise<RegistryEndpointResult> {
    const fallbackDelay = this.getFallbackDelay(endpoints[0])
    if (endpoints.length === 1 || this.config.autoRoute === false) {
      const controller = this.trackController(new AbortController())
      onAttempt?.(endpoints[0])
      return this.fetchRegistryEndpoint(name, endpoints[0], serial, controller.signal)
        .then(result => { this.recordRouteSuccess(result); return result })
        .catch((error) => {
          if (!this.isStale(serial) && !this.isInternalAbort(error)) {
            const reason = this.formatError(error).reason
            if (shouldPenalizeRegistryRoute(reason)) this.recordRouteFailure(endpoints[0], reason)
            attachRegistryAttemptReasons(error, [reason])
          }
          throw error
        })
        .finally(() => this.untrackControllers([controller]))
    }
    return new Promise<RegistryEndpointResult>((resolve, reject) => {
      let settled = false
      let failed = 0
      let lastError: any
      let fallbackStarted = false
      const failureReasons: RegistryStatus['reason'][] = []
      let fallbackReason: RegistryEndpointResult['fallbackReason']
      const controllers = endpoints.map(() => this.trackController(new AbortController()))
      const timer = setTimeout(() => startFallback('primary-slow'), fallbackDelay)

      const finish = () => {
        clearTimeout(timer)
        this.untrackControllers(controllers)
      }
      const settle = (result: RegistryEndpointResult, index: number) => {
        if (settled) return
        settled = true
        finish()
        controllers.forEach((controller, controllerIndex) => {
          if (controllerIndex !== index) controller.abort(new Error('race settled'))
        })
        if (result.endpoint !== endpoints[0]) result.fallbackReason = fallbackReason
        this.recordRouteSuccess(result)
        resolve(result)
      }
      const fail = (endpoint: string, index: number, error: any) => {
        if (settled) return
        if (this.isStale(serial) || this.isInternalAbort(error)) {
          settled = true
          controllers.forEach(controller => controller.abort(new Error('npm registry race cancelled')))
          finish()
          reject(error)
          return
        }
        const reason = this.formatError(error).reason
        failureReasons.push(reason)
        if (shouldPenalizeRegistryRoute(reason)) this.recordRouteFailure(endpoint, reason)
        lastError = error
        if (index === 0) startFallback('primary-failed')
        if (++failed < endpoints.length) return
        settled = true
        finish()
        attachRegistryAttemptReasons(lastError, failureReasons)
        reject(lastError)
      }
      const startEndpoint = (endpoint: string, index: number, waitIndex = 0) => {
        const signal = controllers[index].signal
        this.waitRouteTurn(waitIndex, signal).then(() => {
          if (settled) throw new Error('race settled before request')
          onAttempt?.(endpoint)
          return this.fetchRegistryEndpoint(name, endpoint, serial, signal)
        }).then(result => settle(result, index)).catch(error => fail(endpoint, index, error))
      }
      const startFallback = (reason: NonNullable<typeof fallbackReason>) => {
        if (settled || fallbackStarted) return
        fallbackStarted = true
        fallbackReason = reason
        logger.info(`npm registry fallback race started: probe=${name}, reason=${reason}, count=${endpoints.length - 1}`)
        endpoints.slice(1).forEach((endpoint, index) => startEndpoint(endpoint, index + 1, index))
      }
      startEndpoint(endpoints[0], 0)
    })
  }

  private async probeMetadataEndpoint(name: string, endpoints: string[], serial: number) {
    const start = Date.now()
    logger.info(`npm registry route probe started: probe=${name}, primary=${endpoints[0]}, fallbackCount=${Math.max(0, endpoints.length - 1)}, slowThreshold=${this.getFallbackDelay(endpoints[0])}ms`)
    try {
      const result = await this.raceEndpoints(name, endpoints, serial)
      if (this.isStale(serial)) return
      this.applyRouteProbeResult(name, result, serial, start)
    } catch {
      if (this.isStale(serial)) return
      logger.warn(`npm registry route probe failed: probe=${name}, candidates=${endpoints.length}, elapsed=${Date.now() - start}ms`)
    }
  }

  private async fetchRegistryEndpoint(name: string, endpoint: string, serial: number, signal?: AbortSignal): Promise<RegistryEndpointResult> {
    const attemptStart = Date.now()
    try {
      logger.debug(`fetch npm registry endpoint: package=${name}, endpoint=${endpoint}`)
      const registry = await this.createHttp(endpoint).get(`/${name}`, { signal }) as Registry
      if (this.isStale(serial)) throw new Error('npm registry route probe stale')
      if (!registry?.versions || typeof registry.versions !== 'object') {
        throw new Error(`invalid registry metadata for ${name}`)
      }
      const elapsed = Date.now() - attemptStart
      logger.debug(`fetch npm registry endpoint succeeded: package=${name}, endpoint=${endpoint}, elapsed=${elapsed}ms, versions=${Object.keys(registry.versions).length}`)
      return { endpoint, registry, elapsed }
    } catch (error) {
      const detail = this.formatError(error)
      logger.debug(`fetch npm registry endpoint failed: package=${name}, endpoint=${endpoint}, elapsed=${Date.now() - attemptStart}ms, reason=${detail.reason}, error=${detail.error}`)
      throw error
    }
  }

  private applyRouteProbeResult(name: string, result: RegistryEndpointResult, serial: number, start: number) {
    const previous = this.metadataEndpoint
    this.metadataEndpoint = result.endpoint
    this.routeProbeResult = { serial, name, ...result }
    if (result.endpoint === this.endpoint) {
      logger.info(`npm registry primary selected: probe=${name}, endpoint=${result.endpoint}, elapsed=${result.elapsed}ms, total=${Date.now() - start}ms`)
    } else {
      logger.info(`npm registry fallback selected: probe=${name}, endpoint=${result.endpoint}, previous=${previous}, reason=${result.fallbackReason ?? 'unknown'}, elapsed=${result.elapsed}ms, total=${Date.now() - start}ms`)
    }
    logger.debug(`npm registry route scores after probe: ${formatRouteScores(this.getRouteScores())}`)
  }

  private waitRouteTurn(index: number, signal?: AbortSignal) {
    if (!index) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason)
      const timer = setTimeout(resolve, index * REGISTRY_ROUTE_STAGGER)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(signal.reason)
      }, { once: true })
    })
  }

  private getRouteScore(endpoint: string) {
    const stats = this.routeStats[endpoint]
    let score = endpoint === this.endpoint ? 1 : 0
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
      else if (stats.averageElapsed <= REGISTRY_FAST_ROUTE_THRESHOLD) score += 1
      else if (stats.averageElapsed <= 1200) score += 0.5
      else if (stats.averageElapsed <= 2500) score -= 0.3
      else if (stats.averageElapsed <= 4000) score -= 1
      else score -= 2
    }
    if (stats.lastSuccess && Date.now() - stats.lastSuccess <= Time.minute * 10) score += 1.5
    score -= Math.min(5, (stats.consecutiveFailures ?? 0) * 1.5)
    return score
  }

  private recordRouteSuccess(result: RegistryEndpointResult) {
    const stats = this.routeStats[result.endpoint] ||= { score: 0, successes: 0, failures: 0 }
    stats.successes++
    stats.consecutiveFailures = 0
    stats.failures = Math.max(0, Math.floor(stats.failures * 0.6))
    stats.score = clamp(stats.score + (result.elapsed <= REGISTRY_FAST_ROUTE_THRESHOLD ? 0.4 : 0.1), -6, 3)
    stats.lastSuccess = Date.now()
    stats.averageElapsed = stats.averageElapsed == null
      ? result.elapsed
      : Math.round(stats.averageElapsed * 0.7 + result.elapsed * 0.3)
    this.scheduleStatsWrite()
  }

  private recordRouteFailure(endpoint: string, reason?: RegistryStatus['reason']) {
    const stats = this.routeStats[endpoint] ||= { score: 0, successes: 0, failures: 0 }
    stats.failures++
    stats.consecutiveFailures = (stats.consecutiveFailures ?? 0) + 1
    stats.lastFailure = Date.now()
    stats.lastFailureReason = reason
    stats.score = clamp(stats.score - Math.min(1.5, getFailurePenalty(stats.lastFailureReason)), -8, 3)
    this.scheduleStatsWrite()
  }

  private getFallbackDelay(endpoint: string) {
    const stats = this.routeStats[endpoint]
    if (!stats) return REGISTRY_FAST_ROUTE_THRESHOLD
    const recentSuccess = stats.lastSuccess && Date.now() - stats.lastSuccess <= Time.minute * 10
    if (!recentSuccess && stats.failures >= 3) return 200
    if (!recentSuccess && stats.failures >= 2) return 400
    if (stats.averageElapsed != null) {
      if (stats.averageElapsed > 4000) return 400
      if (stats.averageElapsed > 2500) return 600
    }
    return REGISTRY_FAST_ROUTE_THRESHOLD
  }

  private getRouteScores() {
    return this.getRegistryEndpointCandidates().map(endpoint => ({
      endpoint,
      score: this.getRouteScore(endpoint),
      fallbackDelay: endpoint === this.endpoint ? this.getFallbackDelay(endpoint) : undefined,
      ...this.routeStats[endpoint],
    }))
  }

  private async fetchRegistryByRoute(
    name: string,
    endpoints: string[],
    serial: number,
    onAttempt?: (endpoint: string, attempts: number) => void,
  ): Promise<RegistryRouteResult> {
    let attempts = 0
    let lastEndpoint = endpoints[0]
    const result = await this.raceEndpoints(name, endpoints, serial, (endpoint) => {
      lastEndpoint = endpoint
      onAttempt?.(endpoint, ++attempts)
    })
    return { ...result, attempts, lastEndpoint }
  }

  private setRegistryStatus(name: string, status: RegistryStatus, serial = this.currentSerial) {
    if (this.isStale(serial)) return
    const value = {
      ...this.registryStatus[name],
      ...status,
      updatedAt: Date.now(),
    }
    this.registryStatus[name] = this.tempRegistryStatus[name] = value
    this.flushRegistryStatus()
  }

  private clearRegistryStatus() {
    this.registryStatus = {}
    this.tempRegistryStatus = {}
    this.ctx.get('console')?.broadcast('market/registry-status/clear' as any, {})
  }

  private async fetchPackage(name: string, serial = this.currentSerial) {
    try {
      const registry = await this.getRegistry(name, serial)
      if (this.isStale(serial) || !registry) return
      this.fullCache[name] = this.tempCache[name] = getVersions(Object.values(registry.versions).filter((remote) => {
        if (name === 'koishi') return satisfies(remote.version, '4')
        return !Scanner.isPlugin(name) || Scanner.isCompatible('4', remote)
      }))
      this.flushData()
      return this.fullCache[name]
    } catch (error) {
      logger.warn(error instanceof Error ? error.message : error)
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

  private abortPendingRequests(reason: string) {
    for (const controller of this.pendingControllers) controller.abort(new Error(reason))
    this.pendingControllers.clear()
  }

  private isInternalAbort(error: any) {
    const message = error instanceof Error ? error.message : String(error)
    return /race settled|stale|disposed|aborted|abort/i.test(message)
  }
}

function attachRegistryAttemptReasons(error: unknown, reasons: RegistryStatus['reason'][]) {
  if (!error || typeof error !== 'object') return
  Object.defineProperty(error, 'marketNextReasons', {
    value: [...reasons],
    configurable: true,
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getFailurePenalty(reason?: RegistryStatus['reason']) {
  switch (reason) {
    case 'not-found': return 0.4
    case 'invalid': return 0.8
    case 'http': return 1.2
    case 'timeout':
    case 'network': return 1.8
    default: return 1.5
  }
}

function formatRouteScores(routes: Array<{
  endpoint: string
  score: number
  successes?: number
  failures?: number
  averageElapsed?: number
  fallbackDelay?: number
  lastFailureReason?: RegistryStatus['reason']
}>) {
  if (!routes.length) return '(none)'
  return routes
    .map(route => `${route.endpoint} score=${route.score.toFixed(1)} ok=${route.successes ?? 0} fail=${route.failures ?? 0} avg=${route.averageElapsed ?? '-'} delay=${route.fallbackDelay ?? '-'} last=${route.lastFailureReason ?? '-'}`)
    .join(' | ')
}

function formatEndpointHost(endpoint: string) {
  try {
    return new URL(endpoint).host
  } catch {
    return endpoint
  }
}

import { Context, defineProperty, Dict, HTTP, Logger, pick, Schema, Service, Time, valueMap } from 'koishi'
import Scanner, { DependencyMetaKey, PackageJson, Registry, RemotePackage } from '@koishijs/registry'
import { resolve } from 'path'
import { promises as fsp, readFileSync } from 'fs'
import { compare, satisfies, valid } from 'semver'
import {} from '@koishijs/console'
import {} from '@koishijs/loader'
import getRegistry from 'get-registry'
import which from 'which-pm-runs'
import spawn from 'execa'
import pMap from 'p-map'
import type { RegistryStatus } from '../shared'
import {} from '.'

const logger = new Logger('market')
const REGISTRY_FALLBACK_ENDPOINTS = [
  'https://registry.npmmirror.com',
  'https://mirrors.cloud.tencent.com/npm',
  'https://registry.npmjs.org',
  'https://r.cnpmjs.org',
]
const REGISTRY_ROUTE_STAGGER = 120
const REGISTRY_FAST_ROUTE_THRESHOLD = Time.second * 0.8
const REGISTRY_STATS_TTL = Time.day * 30
const NOT_FOUND_CACHE_TTL = Time.minute * 5

interface PersistedRegistryStats {
  score: number
  averageElapsed?: number
  lastSuccess?: number
  contentEncoding?: string
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

export interface Dependency {
  /**
   * requested semver range
   * @example `^1.2.3` -> `1.2.3`
   */
  request: string
  /**
   * installed package version
   * @example `1.2.5`
   */
  resolved?: string
  /** whether it is a workspace package */
  workspace?: boolean
  /** valid (unsupported) syntax */
  invalid?: boolean
  /** latest version */
  latest?: string
}

export interface YarnLog {
  type: 'warning' | 'info' | 'error' | string
  name: number | null
  displayName: string
  indent?: string
  data: string
}

const levelMap = {
  'info': 'info',
  'warning': 'debug',
  'error': 'warn',
}

export interface LocalPackage extends PackageJson {
  private?: boolean
  $workspace?: boolean
}

export function loadManifest(name: string) {
  const filename = require.resolve(name + '/package.json')
  const meta: LocalPackage = JSON.parse(readFileSync(filename, 'utf8'))
  meta.dependencies ||= {}
  defineProperty(meta, '$workspace', !filename.includes('node_modules'))
  return meta
}

function getVersions(versions: RemotePackage[]) {
  return Object.fromEntries(versions
    .map(item => [item.version, pick(item, ['peerDependencies', 'peerDependenciesMeta', 'deprecated'])] as const)
    .sort(([a], [b]) => compare(b, a)))
}

class Installer extends Service {
  public http: HTTP
  public endpoint: string
  public fullCache: Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>> = {}
  public tempCache: Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>> = {}
  public registryStatus: Dict<RegistryStatus> = {}

  private pkgTasks: Dict<Promise<Dict<Pick<RemotePackage, DependencyMetaKey>>>> = {}
  private agent = which()
  private manifest: PackageJson
  private depCache: Dict<Dependency> = {}
  private depTask?: Promise<Dict<Dependency>>
  private depMetadataFresh = false
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
  private registryRouteStats: Dict<RouteStats> = {}
  private notFoundCache: Dict<number> = {}
  private statsFile: string
  private statsWriteTimer?: ReturnType<typeof setTimeout>
  private flushData: () => void
  private tempRegistryStatus: Dict<RegistryStatus> = {}
  private flushRegistryStatus: () => void
  private serial = 0

  constructor(public ctx: Context, public config: Installer.Config = {}) {
    super(ctx, 'installer')
    this.manifest = loadManifest(this.cwd)
    this.statsFile = resolve(ctx.baseDir, 'cache', 'market-next-registry-stats.json')
    ctx.effect(() => () => clearTimeout(this.statsWriteTimer))
    this.flushData = ctx.throttle(() => {
      ctx.get('console')?.broadcast('market/registry', this.tempCache)
      this.tempCache = {}
    }, 500)
    this.flushRegistryStatus = ctx.throttle(() => {
      ctx.get('console')?.broadcast('market/registry-status', this.tempRegistryStatus)
      this.tempRegistryStatus = {}
    }, 200)
  }

  get cwd() {
    return this.ctx.baseDir
  }

  async start() {
    await this.loadRouteStats()
    await this.resetEndpoint()
    logger.debug(`registry endpoint initialized: ${this.endpoint}, timeout=${this.config.timeout ?? 'default'}, autoRoute=${this.config.autoRoute !== false}`)
    logger.info(`npm registry endpoint initialized: ${this.endpoint}, timeout=${this.config.timeout ?? 'default'}, autoRoute=${this.config.autoRoute !== false}`)
  }

  private createHttp(endpoint: string): HTTP {
    const { timeout } = this.config
    return this.ctx.http.extend({
      endpoint,
      timeout,
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
        this.registryRouteStats[endpoint] = {
          score: stats.score,
          successes: 0,
          failures: 0,
          averageElapsed: stats.averageElapsed,
          lastSuccess: stats.lastSuccess,
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
      for (const [endpoint, s] of Object.entries(this.registryRouteStats)) {
        if (!s) continue
        stats[endpoint] = { score: clamp(s.score, -6, 3), averageElapsed: s.averageElapsed, lastSuccess: s.lastSuccess }
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
      this.registryRouteStats = {}
      logger.info(`npm registry endpoint changed: previous=${previous}, current=${endpoint}, routeStats=reset`)
    }
  }

  resolveName(name: string) {
    if (name.startsWith('@koishijs/plugin-')) return [name]
    if (name.match(/(^|\/)koishi-plugin-/)) return [name]
    if (name[0] === '@') {
      const [left, right] = name.split('/')
      return [`${left}/koishi-plugin-${right}`]
    } else {
      return [`@koishijs/plugin-${name}`, `koishi-plugin-${name}`]
    }
  }

  async findVersion(names: string[]) {
    const entries = await Promise.all(names.map(async (name) => {
      try {
        const versions = Object.entries(await this.getPackage(name))
        if (!versions.length) return
        return { [name]: versions[0][0] }
      } catch (e) {}
    }))
    return entries.find(Boolean)
  }

  private getRegistryEndpoints() {
    const preferred = this.getPreferredMetadataEndpoint()
    return [preferred, ...this.getRouteProbeEndpoints()]
      .filter((endpoint, index, array): endpoint is string => !!endpoint && array.indexOf(endpoint) === index)
  }

  private getPreferredMetadataEndpoint() {
    const endpoint = this.metadataEndpoint || this.endpoint
    if (endpoint === this.endpoint) return endpoint
    const stats = this.registryRouteStats[endpoint]
    if (!stats) return endpoint
    const primaryScore = this.getRegistryRouteScore(this.endpoint)
    const selectedScore = this.getRegistryRouteScore(endpoint)
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
      const delta = this.getRegistryRouteScore(b) - this.getRegistryRouteScore(a)
      if (delta) return delta
      return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0)
    })]
  }

  private async ensureMetadataEndpoint(name: string, serial = this.serial) {
    const endpoints = this.getRouteProbeEndpoints()
    if (!name || endpoints.length <= 1) return
    if (!this.routeProbeTask) {
      this.routeProbeTask = this.probeMetadataEndpoint(name, endpoints, serial)
    }
    await this.routeProbeTask
  }

  private raceEndpoints(name: string, endpoints: string[], serial: number, onAttempt?: (endpoint: string) => void): Promise<RegistryEndpointResult> {
    const fallbackDelay = this.getFallbackDelay(endpoints[0])
    if (endpoints.length === 1 || this.config.autoRoute === false) {
      onAttempt?.(endpoints[0])
      return this.fetchRegistryEndpoint(name, endpoints[0], serial)
        .then(r => { this.recordRegistryRouteSuccess(r); return r })
        .catch(e => { this.recordRegistryRouteFailure(endpoints[0], this.formatRegistryError(e).reason); throw e })
    }
    return new Promise<RegistryEndpointResult>((resolve, reject) => {
      let settled = false, failed = 0, lastError: any, fallbackStarted = false
      let fallbackReason: RegistryEndpointResult['fallbackReason']
      const controllers = endpoints.map(() => new AbortController())
      const timer = setTimeout(() => startFallback('primary-slow'), fallbackDelay)

      const settle = (result: RegistryEndpointResult, index: number) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        controllers.forEach((c, i) => { if (i !== index) c.abort(new Error('race settled')) })
        if (result.endpoint !== endpoints[0]) result.fallbackReason = fallbackReason
        this.recordRegistryRouteSuccess(result)
        resolve(result)
      }
      const fail = (endpoint: string, index: number, error: any) => {
        if (settled) return
        this.recordRegistryRouteFailure(endpoint, this.formatRegistryError(error).reason)
        lastError = error
        if (index === 0) startFallback('primary-failed')
        if (++failed < endpoints.length) return
        settled = true; clearTimeout(timer); reject(lastError)
      }
      const startEndpoint = (endpoint: string, index: number, waitIndex = 0) => {
        const signal = controllers[index].signal
        this.waitRouteTurn(waitIndex, signal).then(() => {
          if (settled) throw new Error('race settled before request')
          onAttempt?.(endpoint)
          return this.fetchRegistryEndpoint(name, endpoint, serial, signal)
        }).then(r => settle(r, index)).catch(e => fail(endpoint, index, e))
      }
      const startFallback = (reason: NonNullable<typeof fallbackReason>) => {
        if (settled || fallbackStarted) return
        fallbackStarted = true; fallbackReason = reason
        logger.info(`npm registry fallback race started: probe=${name}, reason=${reason}, count=${endpoints.length - 1}`)
        endpoints.slice(1).forEach((ep, i) => startEndpoint(ep, i + 1, i))
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
    } catch (error) {
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
      const detail = this.formatRegistryError(error)
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
    logger.debug(`npm registry route scores after probe: ${formatRouteScores(this.getRegistryRouteScores())}`)
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

  private getRegistryRouteScore(endpoint: string) {
    const stats = this.registryRouteStats[endpoint]
    let score = endpoint === this.endpoint ? 1 : 0
    if (!stats) return score

    const total = stats.successes + stats.failures
    if (total) score += (stats.successes / total - 0.5) * 4
    score += stats.score
    score += Math.min(1.5, stats.successes * 0.3)
    score -= Math.min(6, stats.failures * 1.2)
    if (stats.averageElapsed != null) {
      if (stats.averageElapsed <= 300) score += 4
      else if (stats.averageElapsed <= 800) score += 3
      else if (stats.averageElapsed <= REGISTRY_FAST_ROUTE_THRESHOLD) score += 2
      else if (stats.averageElapsed <= 2500) score += 0
      else if (stats.averageElapsed <= 4000) score -= 2
      else score -= 4
    }
    if (stats.lastSuccess && Date.now() - stats.lastSuccess <= Time.minute * 10) score += 0.5
    return score
  }

  private recordRegistryRouteSuccess(result: RegistryEndpointResult) {
    const stats = this.registryRouteStats[result.endpoint] ||= { score: 0, successes: 0, failures: 0 }
    stats.successes++
    stats.score = clamp(stats.score + (result.elapsed <= REGISTRY_FAST_ROUTE_THRESHOLD ? 0.5 : -0.5), -6, 3)
    stats.lastSuccess = Date.now()
    stats.averageElapsed = stats.averageElapsed == null
      ? result.elapsed
      : Math.round(stats.averageElapsed * 0.7 + result.elapsed * 0.3)
    this.scheduleStatsWrite()
  }

  private recordRegistryRouteFailure(endpoint: string, reason?: RegistryStatus['reason']) {
    const stats = this.registryRouteStats[endpoint] ||= { score: 0, successes: 0, failures: 0 }
    stats.failures++
    stats.lastFailure = Date.now()
    stats.lastFailureReason = reason
    stats.score = clamp(stats.score - getFailurePenalty(stats.lastFailureReason), -8, 3)
    this.scheduleStatsWrite()
  }

  private getFallbackDelay(endpoint: string) {
    const stats = this.registryRouteStats[endpoint]
    if (!stats) return REGISTRY_FAST_ROUTE_THRESHOLD
    const recentSuccess = stats.lastSuccess && Date.now() - stats.lastSuccess <= Time.minute * 10
    if (!recentSuccess && stats.failures >= 3) return 200
    if (!recentSuccess && stats.failures >= 2) return 400
    if (stats.averageElapsed != null) {
      if (stats.averageElapsed > 4000) return 400
      if (stats.averageElapsed > 2500) return 800
    }
    return REGISTRY_FAST_ROUTE_THRESHOLD
  }

  private getRegistryRouteScores() {
    return this.getRegistryEndpointCandidates().map(endpoint => ({
      endpoint,
      score: this.getRegistryRouteScore(endpoint),
      fallbackDelay: endpoint === this.endpoint ? this.getFallbackDelay(endpoint) : undefined,
      ...this.registryRouteStats[endpoint],
    }))
  }

  private async fetchRegistryByRoute(name: string, endpoints: string[], serial: number, onAttempt?: (endpoint: string, attempts: number) => void): Promise<RegistryRouteResult> {
    let attempts = 0, lastEndpoint = endpoints[0]
    const result = await this.raceEndpoints(name, endpoints, serial, (endpoint) => {
      lastEndpoint = endpoint
      onAttempt?.(endpoint, ++attempts)
    })
    return { ...result, attempts, lastEndpoint }
  }

  private isStale(serial: number) {
    return serial !== this.serial || !this.ctx.scope.isActive
  }

  private setRegistryStatus(name: string, status: RegistryStatus, serial = this.serial) {
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

  async getRegistry(name: string, serial = this.serial) {
    const start = Date.now()
    const maxRetry = Math.max(0, this.config.retry ?? 1)
    let attempts = 0
    let lastError: any
    let lastEndpoint = this.metadataEndpoint || this.endpoint
    this.setRegistryStatus(name, {
      loading: true,
      error: undefined,
      reason: undefined,
      endpoint: lastEndpoint,
      attempts,
      elapsed: undefined,
    }, serial)

    await this.ensureMetadataEndpoint(name, serial)
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
        const detail = this.formatRegistryError(error)
        logger.debug(`failed routed registry metadata for ${name}, attempt=${retry + 1}/${maxRetry + 1}, endpoint=${lastEndpoint}, attempts=${attempts}: ${detail.error}`)
        if (detail.reason === 'not-found') break
        if (retry < maxRetry) await sleep(300 * (retry + 1))
      }
    }

    const detail = this.formatRegistryError(lastError)
    this.setRegistryStatus(name, {
      loading: false,
      reason: detail.reason,
      error: detail.error,
      endpoint: lastEndpoint,
      attempts,
      elapsed: Date.now() - start,
    }, serial)
    logger.warn(`failed to fetch registry metadata for ${name}: ${detail.error}`)
  }

  private formatRegistryError(error: any): Required<Pick<RegistryStatus, 'reason' | 'error'>> {
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

  private async _getPackage(name: string, serial = this.serial) {
    try {
      const registry = await this.getRegistry(name, serial)
      if (this.isStale(serial)) return
      if (!registry) return
      this.fullCache[name] = this.tempCache[name] = getVersions(Object.values(registry.versions).filter((remote) => {
        if (name === 'koishi') return satisfies(remote.version, '4')
        return !Scanner.isPlugin(name) || Scanner.isCompatible('4', remote)
      }))
      this.flushData()
      return this.fullCache[name]
    } catch (e) {
      logger.warn(e.message)
    }
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
    if (!this.pkgTasks[name]) {
      const task = this._getPackage(name, this.serial)
      this.pkgTasks[name] = task
      task.then((versions) => {
        if (this.pkgTasks[name] !== task) return
        if (!versions) delete this.pkgTasks[name]
      }, (error) => {
        if (this.pkgTasks[name] !== task) return
        delete this.pkgTasks[name]
        const reason = this.formatRegistryError(error).reason
        if (reason === 'not-found') this.notFoundCache[name] = Date.now()
      })
    }
    return this.pkgTasks[name]
  }

  private getLocalDepsSnapshot() {
    const start = Date.now()
    const result = valueMap(this.manifest.dependencies, (request) => {
      return { request: request.replace(/^[~^]/, '') } as Dependency
    })
    const names = Object.keys(result)
    for (const name of names) {
      try {
        const meta = loadManifest(name)
        result[name].resolved = meta.version
        result[name].workspace = meta.$workspace
        logger.debug(`local dependency resolved: ${name}@${meta.version}, workspace=${!!meta.$workspace}, request=${result[name].request}`)
      } catch {
        logger.debug(`local dependency not found before metadata fetch: ${name}, request=${result[name].request}`)
      }

      if (!valid(result[name].request)) {
        result[name].invalid = true
        logger.debug(`dependency request is not exact semver: ${name}, request=${result[name].request}`)
      }

      const previous = this.depCache?.[name]
      if (previous?.latest && previous.request === result[name].request && previous.resolved === result[name].resolved) {
        result[name].latest = previous.latest
      }
    }
    const installed = Object.values(result).filter(dep => dep.resolved).length
    const invalid = Object.values(result).filter(dep => dep.invalid).length
    logger.info(`dependency local snapshot ready: total=${names.length}, installed=${installed}, invalid=${invalid}, elapsed=${Date.now() - start}ms`)
    return result
  }

  private async _refreshDependencyMetadata(result = this.depCache, serial = this.serial) {
    const start = Date.now()
    const names = Object.keys(result)
    const targets = names.filter((name) => !result[name].workspace && !result[name].invalid)
    logger.debug(`refresh dependency metadata started: total=${names.length}, targets=${targets.length}, concurrency=${this.config.concurrency ?? 4}, registry=${this.endpoint}, autoRoute=${this.config.autoRoute !== false}`)
    const probeName = pickMetadataProbe(targets)
    if (probeName) await this.ensureMetadataEndpoint(probeName, this.serial)
    logger.debug(`refresh dependency metadata route ready: probe=${probeName ?? '-'}, selected=${this.metadataEndpoint}, configured=${this.endpoint}, probed=${!!this.routeProbeResult}`)
    await pMap(targets, async (name) => {
      if (this.isStale(serial)) return
      const versions = await this.getPackage(name)
      if (this.isStale(serial)) return
      if (versions) {
        result[name].latest = Object.keys(versions)[0]
        logger.debug(`dependency latest resolved: ${name}, resolved=${result[name].resolved ?? '-'}, latest=${result[name].latest}, versions=${Object.keys(versions).length}`)
      } else {
        logger.debug(`dependency latest unresolved: ${name}, resolved=${result[name].resolved ?? '-'}, request=${result[name].request}`)
      }
    }, { concurrency: this.config.concurrency ?? 4 })
    logger.info(`dependency metadata refresh completed: total=${names.length}, targets=${targets.length}, registry=${this.metadataEndpoint}, elapsed=${Date.now() - start}ms`)
    if (!this.isStale(serial)) {
      this.depMetadataFresh = true
      this.ctx.get('console')?.refresh('dependencies')
    }
    return result
  }

  refreshDependencyMetadata(wait = false) {
    if (this.depMetadataFresh) return wait ? Promise.resolve(this.depCache) : undefined
    if (!this.depTask) {
      const task = this._refreshDependencyMetadata(this.depCache, this.serial)
      this.depTask = task
      task.then(() => {
        if (this.depTask === task) this.depTask = undefined
      }, (error) => {
        if (this.depTask === task) this.depTask = undefined
        logger.warn(`dependency metadata refresh failed: ${error instanceof Error ? error.message : error}`)
      })
    }
    return wait ? this.depTask : undefined
  }

  getDeps(options: Installer.GetDepsOptions = {}) {
    if (!Object.keys(this.depCache).length) {
      this.depCache = this.getLocalDepsSnapshot()
    }
    if (options.metadata) return this.refreshDependencyMetadata(true)
    if (options.background !== false) this.refreshDependencyMetadata(false)
    return this.depCache
  }

  async refreshData() {
    await Promise.all([
      this.ctx.get('console')?.refresh('dependencies'),
      this.ctx.get('console')?.refresh('registry'),
      this.ctx.get('console')?.refresh('registryStatus'),
      this.ctx.get('console')?.refresh('packages'),
    ])
  }

  async refresh(refresh = false, waitMetadata = false) {
    const start = Date.now()
    this.serial++
    await this.resetEndpoint()
    this.manifest = loadManifest(this.cwd)
    this.pkgTasks = {}
    this.fullCache = {}
    this.tempCache = {}
    this.clearRegistryStatus()
    this.depTask = undefined
    this.depMetadataFresh = false
    this.depCache = this.getLocalDepsSnapshot()
    const metadataTask = this.refreshDependencyMetadata(true)
    if (!refresh) return
    await this.refreshData()
    if (waitMetadata) await metadataTask
    logger.info(`dependency refresh requested by console: deps=${Object.keys(this.manifest.dependencies ?? {}).length}, waitMetadata=${waitMetadata}, elapsed=${Date.now() - start}ms`)
  }

  async exec(args: string[]) {
    const name = this.agent?.name ?? 'npm'
    const useJson = name === 'yarn' && this.agent.version >= '2'
    if (name !== 'yarn') args.unshift('install')
    const start = Date.now()
    logger.info(`run package manager: agent=${name}${this.agent?.version ? '@' + this.agent.version : ''}, args=${args.join(' ') || '(none)'}, cwd=${this.cwd}, json=${useJson}`)
    return new Promise<number>((resolve) => {
      if (useJson) args.push('--json')
      const child = spawn(name, args, { cwd: this.cwd })
      child.on('exit', (code) => {
        logger.info(`package manager exited: code=${code}, elapsed=${Date.now() - start}ms`)
        resolve(code)
      })
      child.on('error', (error) => {
        logger.warn(`package manager failed to start: ${error instanceof Error ? error.message : String(error)}`)
        resolve(-1)
      })

      let stderr = ''
      child.stderr.on('data', (data) => {
        data = stderr + data.toString()
        const lines = data.split('\n')
        stderr = lines.pop()!
        for (const line of lines) {
          logger.warn(line)
          this.ctx.get('console')?.broadcast('market/install-log', { type: 'stderr', line })
        }
      })

      let stdout = ''
      child.stdout.on('data', (data) => {
        data = stdout + data.toString()
        const lines = data.split('\n')
        stdout = lines.pop()!
        for (const line of lines) {
          if (!useJson || line[0] !== '{') {
            logger.info(line)
            this.ctx.get('console')?.broadcast('market/install-log', { type: 'stdout', line })
            continue
          }
          try {
            const { type, data } = JSON.parse(line) as YarnLog
            logger[levelMap[type] ?? 'info'](data)
            this.ctx.get('console')?.broadcast('market/install-log', { type: 'stdout', line: data })
          } catch (error) {
            logger.warn(line)
            logger.warn(error)
            this.ctx.get('console')?.broadcast('market/install-log', { type: 'stderr', line })
          }
        }
      })
    })
  }

  async override(deps: Dict<string>) {
    const filename = resolve(this.cwd, 'package.json')
    logger.debug(`override package dependencies: file=${filename}, changes=${formatDeps(deps)}`)
    for (const key in deps) {
      if (deps[key]) {
        this.manifest.dependencies[key] = deps[key]
      } else {
        delete this.manifest.dependencies[key]
      }
    }
    this.manifest.dependencies = Object.fromEntries(Object.entries(this.manifest.dependencies).sort((a, b) => a[0].localeCompare(b[0])))
    await fsp.writeFile(filename, JSON.stringify(this.manifest, null, 2) + '\n')
    logger.info(`package dependencies updated: changes=${formatDeps(deps)}, total=${Object.keys(this.manifest.dependencies).length}`)
  }

  private _install() {
    const args: string[] = []
    if (this.config.endpoint) {
      args.push('--registry', this.endpoint)
    }
    return this.exec(args)
  }

  private _getLocalDeps(override: Dict<string>) {
    return valueMap(override, (request, name) => {
      const dep = { request } as Dependency
      try {
        const meta = loadManifest(name)
        dep.resolved = meta.version
        dep.workspace = meta.$workspace
      } catch {}
      return dep
    })
  }

  async install(deps: Dict<string>, forced?: boolean, beforeReload?: () => unknown | Promise<unknown>) {
    const start = Date.now()
    logger.info(`dependency install requested: deps=${formatDeps(deps)}, forced=${!!forced}`)
    const localDeps = this._getLocalDeps(deps)
    logger.debug(`dependency install local state: ${formatLocalDeps(localDeps)}`)
    await this.override(deps)

    for (const name in deps) {
      const { resolved, workspace } = localDeps[name] || {}
      if (workspace || deps[name] && resolved && satisfies(resolved, deps[name], { includePrerelease: true })) continue
      forced = true
      logger.debug(`dependency install requires package manager: name=${name}, requested=${deps[name] || '(remove)'}, resolved=${resolved ?? '-'}, workspace=${!!workspace}`)
      break
    }

    if (forced) {
      const code = await this._install()
      if (code) return code
    }

    await this.refresh()
    const newDeps = await this.getDeps()
    let shouldReload = false
    for (const name in localDeps) {
      const { resolved, workspace } = localDeps[name]
      if (workspace || !newDeps[name]) continue
      if (newDeps[name].resolved === resolved) continue
      try {
        if (!(require.resolve(name) in require.cache)) continue
      } catch (error) {
        // FIXME https://github.com/koishijs/webui/issues/273
        // I have no idea why this happens and how to fix it.
        logger.error(error)
      }
      shouldReload = true
      logger.debug(`dependency changed may require full reload: ${name}, previous=${resolved ?? '-'}, current=${newDeps[name]?.resolved ?? '-'}`)
    }
    if (beforeReload) {
      try {
        logger.debug('run pre-reload dependency hook')
        await beforeReload()
      } catch (error) {
        logger.warn(error)
      }
    }
    await this.refreshData()
    logger.info(`dependency install completed: deps=${formatDeps(deps)}, forced=${!!forced}, fullReload=${shouldReload}, elapsed=${Date.now() - start}ms`)
    if (shouldReload) {
      logger.info('dependency install triggers full reload')
      this.ctx.loader.fullReload()
    }

    return 0
  }
}

namespace Installer {
  export interface GetDepsOptions {
    metadata?: boolean
    background?: boolean
  }

  export interface Config {
    endpoint?: string
    timeout?: number
    autoRoute?: boolean
    retry?: number
    concurrency?: number
  }

  export const Config: Schema<Config> = Schema.object({
    endpoint: Schema.string().role('link'),
    timeout: Schema.number().role('time').default(Time.second * 5),
    autoRoute: Schema.boolean().default(true),
    retry: Schema.number().min(0).max(5).step(1).default(1),
    concurrency: Schema.number().min(1).max(16).step(1).default(4),
  }) // TODO .hidden()
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatDeps(deps: Dict<string>) {
  const entries = Object.entries(deps)
  if (!entries.length) return '(none)'
  return entries.map(([name, version]) => `${name}@${version || '(remove)'}`).join(', ')
}

function formatLocalDeps(deps: Dict<Dependency>) {
  const entries = Object.entries(deps)
  if (!entries.length) return '(none)'
  return entries.map(([name, dep]) => `${name}{request=${dep.request || '-'},resolved=${dep.resolved ?? '-'},workspace=${!!dep.workspace}}`).join(', ')
}

function pickMetadataProbe(names: string[]) {
  return names.find(name => name === 'koishi')
    || names.find(name => name === '@koishijs/plugin-console')
    || names.find(name => Scanner.isPlugin(name))
    || names[0]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getFailurePenalty(reason?: RegistryStatus['reason']) {
  switch (reason) {
    case 'not-found':
      return 0.4
    case 'invalid':
      return 0.8
    case 'http':
      return 1.2
    case 'timeout':
    case 'network':
      return 1.8
    default:
      return 1.5
  }
}

function formatRouteScores(routes: Array<{ endpoint: string, score: number, successes?: number, failures?: number, averageElapsed?: number, fallbackDelay?: number, lastFailureReason?: RegistryStatus['reason'] }>) {
  if (!routes.length) return '(none)'
  return routes
    .map(route => `${route.endpoint} score=${route.score.toFixed(1)} ok=${route.successes ?? 0} fail=${route.failures ?? 0} avg=${route.averageElapsed ?? '-'} delay=${route.fallbackDelay ?? '-'} last=${route.lastFailureReason ?? '-'}`)
    .join(' | ')
}

export default Installer

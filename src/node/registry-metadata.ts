import { Context, Dict, HTTP, Logger, Time } from 'koishi'
import Scanner, { DependencyMetaKey, Registry, RemotePackage } from '@koishijs/registry'
import { satisfies } from 'semver'
import {
  allRegistryAttemptsNotFound,
  getRegistryAttemptReasons,
  type RegistryStatus,
} from '../shared'
import {
  getVersions,
  sleep,
  type InstallFallbackCandidate,
  type InstallerConfig,
} from './installer-types'
import { RegistryRouter } from './registry-router'

const logger = new Logger('market')
const NOT_FOUND_CACHE_TTL = Time.minute * 5

export class RegistryMetadata {
  fullCache: Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>> = {}
  registryStatus: Dict<RegistryStatus> = {}

  tempCache: Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>> = {}
  private pkgTasks: Dict<Promise<Dict<Pick<RemotePackage, DependencyMetaKey>> | undefined>> = {}
  private router: RegistryRouter
  private notFoundCache: Dict<number> = {}
  private tempRegistryStatus: Dict<RegistryStatus> = {}
  private flushData: () => void
  private flushRegistryStatus: () => void

  constructor(private ctx: Context, private config: InstallerConfig) {
    this.router = new RegistryRouter(ctx, config)
    this.flushData = ctx.throttle(() => {
      ctx.get('console')?.broadcast('market/registry', this.tempCache)
      this.tempCache = {}
    }, 500)
    this.flushRegistryStatus = ctx.throttle(() => {
      ctx.get('console')?.broadcast('market/registry-status', { ...this.tempRegistryStatus })
      this.tempRegistryStatus = {}
    }, 200)
  }

  get http(): HTTP {
    return this.router.http
  }

  get endpoint() {
    return this.router.endpoint
  }

  get serial() {
    return this.router.serial
  }

  get selectedEndpoint() {
    return this.router.selectedEndpoint
  }

  get hasRouteProbeResult() {
    return this.router.hasRouteProbeResult
  }

  async restoreRouteStats() {
    await this.router.restoreRouteStats()
  }

  async initializeEndpoint() {
    await this.router.initializeEndpoint()
  }

  async reset(reason: string) {
    await this.router.reset(reason)
    this.pkgTasks = {}
    this.fullCache = {}
    this.tempCache = {}
    this.clearRegistryStatus()
  }

  dispose() {
    this.router.dispose()
  }

  hasRecentNotFound(name: string) {
    const timestamp = this.notFoundCache[name]
    return !!timestamp && Date.now() - timestamp < NOT_FOUND_CACHE_TTL
  }

  async ensureEndpoint(name: string, serial = this.serial) {
    await this.router.ensureEndpoint(name, serial)
  }

  async getRegistry(name: string, serial = this.serial) {
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

    const probe = this.router.getRouteProbeResult(name, serial)
    if (probe) {
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
      const endpoints = this.router.getRegistryEndpoints()
      logger.debug(`registry metadata candidates for ${name}: endpoints=${endpoints.join(', ')}, retry=${retry + 1}/${maxRetry + 1}, concurrency=${this.config.concurrency ?? 4}`)
      try {
        const result = await this.router.fetchRegistryByRoute(name, endpoints, serial, (endpoint) => {
          attempts++
          lastEndpoint = endpoint
          this.setRegistryStatus(name, { loading: true, endpoint, attempts }, serial)
        })
        if (this.isStale(serial)) return
        if (result.endpoint !== this.selectedEndpoint) {
          logger.debug(`routed npm registry endpoint for ${name}: ${result.endpoint}`)
          logger.info(`npm registry route selected for ${name}: endpoint=${result.endpoint}, previous=${this.selectedEndpoint}, reason=${result.fallbackReason ?? 'same-priority'}, elapsed=${result.elapsed}ms`)
          this.router.selectEndpoint(result.endpoint)
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
      const task = this.fetchPackage(name, this.serial)
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
    return this.router.getInstallFallbackCandidate(failedEndpoint)
  }

  isStale(serial: number) {
    return this.router.isStale(serial)
  }

  formatError(error: any): Required<Pick<RegistryStatus, 'reason' | 'error'>> {
    return this.router.formatError(error)
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

  private async fetchPackage(name: string, serial = this.serial) {
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
}

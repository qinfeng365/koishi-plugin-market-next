import { Context, Dict, HTTP, Time } from 'koishi'
import Scanner, { DependencyMetaKey, Registry, RemotePackage } from '@koishijs/registry'
import { gt, satisfies } from 'semver'
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
import { logger } from './logger'
const NOT_FOUND_CACHE_TTL = Time.minute * 5

function filterVersions(name: string, registry: Registry) {
  return getVersions(Object.values(registry.versions).filter((remote) => {
    if (name === 'koishi') return satisfies(remote.version, '4')
    return !Scanner.isPlugin(name) || Scanner.isCompatible('4', remote)
  }))
}

export class RegistryMetadata {
  fullCache: Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>> = {}
  registryStatus: Dict<RegistryStatus> = {}

  tempCache: Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>> = {}
  private pkgTasks: Dict<Promise<Dict<Pick<RemotePackage, DependencyMetaKey>> | undefined>> = {}
  private router: RegistryRouter
  private notFoundCache: Dict<number> = {}
  private fetching = new Map<string, Promise<unknown>>()
  private tempRegistryStatus: Dict<RegistryStatus> = {}
  private flushData: () => void
  private flushRegistryStatus: () => void

  // Sent as patches of the registry and registryStatus data services rather than events of their
  // own: Koishi applies those itself, so none is lost before the market-next page has loaded, and
  // they go only to clients that may read the data services. A patch that arrives before a newly
  // connected page has the data is skipped, but that data is read after the patched values were
  // stored, so it has them.
  constructor(private ctx: Context, private config: InstallerConfig) {
    this.router = new RegistryRouter(ctx, config)
    // A reset sends what is waiting itself, so a later call may find nothing to send.
    this.flushData = ctx.throttle(() => {
      if (!Object.keys(this.tempCache).length) return
      ctx.get('console')?.patch('registry', this.tempCache)
      this.tempCache = {}
    }, 500)
    this.flushRegistryStatus = ctx.throttle(() => {
      if (!Object.keys(this.tempRegistryStatus).length) return
      ctx.get('console')?.patch('registryStatus', this.tempRegistryStatus)
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

  async reset(reason: string, deps: string[]) {
    const previous = this.registryStatus
    const isDependency = new Set(deps)
    // Still waiting in the throttles; the console gets them below rather than never.
    const versions = this.tempCache
    const pending = this.tempRegistryStatus
    this.pkgTasks = {}
    this.fetching.clear()
    this.fullCache = {}
    this.tempCache = {}
    this.notFoundCache = {}
    // The console keeps what it has until the new results are patched in, so the dependencies page
    // does not empty out and refill while the check runs. Errors of dependencies are kept here too,
    // since a status patch replaces the whole entry: the next fetch starts from them and settles them.
    // Local and invalid dependencies are not fetched again, so theirs stays until the package is
    // fetched or no longer a dependency; their cards ignore the status.
    this.registryStatus = Object.fromEntries(deps
      .filter(name => previous[name]?.error)
      .map(name => [name, { ...previous[name], loading: false }]))
    this.tempRegistryStatus = {}
    // In the same tick as the state above, so no fetch of the old or the new serial writes between.
    // Fetches that start while the endpoint is resolved again still use the previous one, which is
    // nearly always the same.
    const resetting = this.router.reset(reason)
    if (Object.keys(versions).length) this.ctx.get('console')?.patch('registry', versions)
    // Fetches the reset cancelled never settle their status. A dependency gets what it has here:
    // its kept error, or null, which reads as being fetched like a status not sent yet, but without
    // the timeout of a loading one, since the check may take a while to reach it again. The check
    // fetches every dependency except local and invalid ones, whose cards ignore the status; if
    // it fails before reaching one, that one reads as being fetched until the next check.
    const cancelled = Object.keys(previous).filter(name => previous[name].loading)
    const statuses = {
      ...pending,
      ...Object.fromEntries(cancelled
        .filter(name => isDependency.has(name))
        .map(name => [name, this.registryStatus[name] ?? null])),
    }
    if (Object.keys(statuses).length) this.ctx.get('console')?.patch('registryStatus', statuses)
    await resetting
    // Other packages were fetched for a dialog, which may still be waiting for their versions and
    // does not ask again; they stay loading and are fetched again here.
    for (const name of cancelled) {
      if (!isDependency.has(name)) this.getPackage(name).catch(() => {})
    }
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
    // An earlier error stays until this fetch settles, so the dependency stays in its group meanwhile.
    this.setRegistryStatus(name, {
      loading: true,
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
    // Versions from the market scan settle a kept error, without ending a fetch that is running.
    if (this.registryStatus[name]?.error) this.setRegistryStatus(name, { error: undefined, reason: undefined })
    delete this.notFoundCache[name]
    this.fullCache[name] = this.tempCache[name] = getVersions(versions)
    this.flushData()
    this.pkgTasks[name] = Promise.resolve(this.fullCache[name])
  }

  // Fetches the versions of one package again, quietly and through the normal route (the
  // configured registry, with fallbacks only when auto routing is on and it is slow or failing).
  // The cached versions and registry status stay as they are unless a newer release is found,
  // and a failure only logs at debug level. The route probe payload is skipped, since it belongs
  // to the current serial and may be stale.
  async recheckPackage(name: string) {
    if (this.fetching.has(name)) return this.pkgTasks[name].catch(() => undefined)
    const serial = this.serial
    try {
      await this.ensureEndpoint(name, serial)
      if (this.isStale(serial)) return
      const { registry, endpoint } = await this.router.fetchRegistryByRoute(name, this.router.getRegistryEndpoints(), serial)
      if (this.isStale(serial) || this.fetching.has(name)) return
      const versions = filterVersions(name, registry)
      const latest = Object.keys(versions)[0]
      const known = Object.keys(this.fullCache[name] ?? {})[0]
      if (!latest || known && !gt(latest, known)) return this.fullCache[name]
      delete this.notFoundCache[name]
      this.fullCache[name] = this.tempCache[name] = versions
      this.flushData()
      this.pkgTasks[name] = Promise.resolve(versions)
      // An earlier failed fetch may have left an error on the card.
      this.setRegistryStatus(name, { loading: false, error: undefined, reason: undefined, endpoint }, serial)
      return versions
    } catch (error) {
      logger.debug(`registry metadata recheck failed: ${name}, error=${this.formatError(error).error}`)
    }
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
      this.fetching.set(name, task)
      task.finally(() => {
        if (this.fetching.get(name) === task) this.fetching.delete(name)
      }).catch(() => {})
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

  private async fetchPackage(name: string, serial = this.serial) {
    try {
      const registry = await this.getRegistry(name, serial)
      if (this.isStale(serial) || !registry) return
      this.fullCache[name] = this.tempCache[name] = filterVersions(name, registry)
      this.flushData()
      return this.fullCache[name]
    } catch (error) {
      logger.warn(error instanceof Error ? error.message : error)
      throw error
    }
  }
}

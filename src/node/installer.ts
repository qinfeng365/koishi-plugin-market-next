import { Context, Dict, Logger, Schema, Service, Time, valueMap } from 'koishi'
import Scanner, { PackageJson, RemotePackage } from '@koishijs/registry'
import { resolve } from 'path'
import { promises as fsp } from 'fs'
import { satisfies, valid } from 'semver'
import {} from '@koishijs/console'
import {} from '@koishijs/loader'
import which from 'which-pm-runs'
import spawn from 'execa'
import pMap from 'p-map'
import {
  classifyDependencySource,
  classifyRegistryNotFoundDependency,
  findDependenciesNeedingSourceCheck,
  findUnboundLocalDependencies,
  reuseConfirmedDependencySource,
} from '../shared'
import {} from '.'
import { prepareLocalBindingPackage } from './local-binding'
import {
  getLocalPackageOperation,
  LocalPackageUploadStore,
  type LocalPackageUploadChunkRequest,
  type LocalPackageUploadCommitResult,
  type LocalPackageUploadFinishRequest,
  type LocalPackageUploadPreview,
  type LocalPackageUploadProgress,
  type LocalPackageUploadStartRequest,
  type LocalPackageUploadStartResult,
} from './local-upload'
import {
  createEnvironmentSnapshot,
  EnvironmentSnapshot,
  EnvironmentSnapshotPreview,
  EnvironmentSnapshotStore,
  EnvironmentSnapshotSummary,
  getEnvironmentDiff,
  getEnvironmentInstallChanges,
  summarizeEnvironmentSnapshot,
  type EnvironmentDependencySnapshot,
  type EnvironmentSnapshotSource,
} from './environment'
import { RegistryMetadata } from './registry-metadata'
import {
  InstallHistoryStore,
  createInstallHistoryChanges,
  type InstallHistoryChange,
  type InstallHistoryEntry,
  type InstallHistoryStatus,
  type InstallLogDetail,
} from './install-history'
import {
  FULL_RELOAD_DELAY,
  SELF_PACKAGE,
  formatDeps,
  formatLocalDeps,
  levelMap,
  loadManifest,
  pickMetadataProbe,
  type Dependency,
  type InstallerConfig,
  type InstallerGetDepsOptions,
  type InstallFallbackCandidate,
  type InstallOptions,
  type LocalBindingResult,
  type LocalPackage,
  type PackageManifestSnapshot,
  type YarnLog,
} from './installer-types'

export { loadManifest } from './installer-types'
export type {
  Dependency,
  InstallFallbackCandidate,
  InstallOptions,
  LocalBindingResult,
  LocalPackage,
  YarnLog,
} from './installer-types'
export type {
  InstallHistoryChange,
  InstallHistoryEntry,
  InstallHistoryStatus,
  InstallLogDetail,
} from './install-history'

const logger = new Logger('market')

class Installer extends Service {
  private agent = which()
  private manifest: PackageJson
  private depCache: Dict<Dependency> = {}
  private depTask?: Promise<Dict<Dependency>>
  private depMetadataFresh = false
  private installTask = Promise.resolve()
  private installActive = false
  private metadata: RegistryMetadata
  private installHistory: InstallHistoryStore
  private environmentSnapshots: EnvironmentSnapshotStore
  private localPackageUploads: LocalPackageUploadStore

  constructor(public ctx: Context, public config: Installer.Config = {}) {
    super(ctx, 'installer')
    this.manifest = loadManifest(this.cwd)
    this.metadata = new RegistryMetadata(ctx, config)
    this.installHistory = new InstallHistoryStore(ctx, config, name => this.depCache[name]?.resolved)
    this.environmentSnapshots = new EnvironmentSnapshotStore(
      resolve(ctx.baseDir, 'data', 'market-next-environment-snapshots.json'),
      message => logger.warn(message),
    )
    this.localPackageUploads = new LocalPackageUploadStore(ctx.baseDir, message => logger.warn(message))
    ctx.setInterval(() => {
      void this.localPackageUploads.pruneExpired()
    }, Time.minute * 5)
    ctx.effect(() => () => {
      this.metadata.dispose()
      void this.localPackageUploads.dispose()
    })
  }

  get cwd() {
    return this.ctx.baseDir
  }

  get isInstalling() {
    return this.installActive
  }

  get http() {
    return this.metadata.http
  }

  get endpoint() {
    return this.metadata.endpoint
  }

  get fullCache() {
    return this.metadata.fullCache
  }

  get tempCache() {
    return this.metadata.tempCache
  }

  get registryStatus() {
    return this.metadata.registryStatus
  }

  async start() {
    await this.metadata.restoreRouteStats()
    await this.installHistory.cleanup()
    await this.metadata.initializeEndpoint()
    logger.debug(`registry endpoint initialized: ${this.endpoint}, timeout=${this.config.timeout ?? 'default'}, autoRoute=${this.config.autoRoute !== false}`)
    logger.info(`npm registry endpoint initialized: ${this.endpoint}, timeout=${this.config.timeout ?? 'default'}, autoRoute=${this.config.autoRoute !== false}`)

    // Probe once per backend lifecycle; DataService reads stay passive so F5 does not retrigger it.
    await this.recordCurrentEnvironmentSnapshot('startup').catch((error) => {
      logger.warn(`failed to record startup environment snapshot: ${error instanceof Error ? error.message : error}`)
    })
    const dependencies = this.getDeps({ background: false })
    logger.info(`dependency startup metadata probe scheduled: deps=${Object.keys(dependencies).length}`)
    this.refreshDependencyMetadata(false)
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
        const versions = Object.entries(await this.getPackage(name) ?? {})
        if (!versions.length) return
        return { [name]: versions[0][0] }
      } catch {}
    }))
    return entries.find(Boolean)
  }

  getInstallFallbackCandidate(failedEndpoint?: string): InstallFallbackCandidate | undefined {
    return this.metadata.getInstallFallbackCandidate(failedEndpoint)
  }

  getRegistry(name: string, serial = this.metadata.serial) {
    return this.metadata.getRegistry(name, serial)
  }

  setPackage(name: string, versions: RemotePackage[]) {
    this.metadata.setPackage(name, versions)
  }

  getPackage(name: string) {
    return this.metadata.getPackage(name)
  }

  private formatRegistryError(error: any) {
    return this.metadata.formatError(error)
  }

  private isStale(serial: number) {
    return this.metadata.isStale(serial)
  }

  private markRegistryNotFoundDependency(name: string, dependency = this.depCache[name]) {
    const source = classifyRegistryNotFoundDependency(dependency, Scanner.isPlugin(name))
    if (!source || !dependency) return false
    Object.assign(dependency, source)
    dependency.invalid = false
    delete dependency.latest
    logger.info(`dependency classified as unbound local plugin: ${name}@${dependency.resolved}`)
    return true
  }

  private getLocalDepsSnapshot() {
    const start = Date.now()
    const result = valueMap(this.manifest.dependencies, (request) => {
      return { request: request.replace(/^[~^]/, '') } as Dependency
    })
    const names = Object.keys(result)
    for (const name of names) {
      try {
        const meta = loadManifest(name, this.cwd)
        result[name].resolved = meta.version
        result[name].workspace = meta.$workspace
        logger.debug(`local dependency resolved: ${name}@${meta.version}, workspace=${!!meta.$workspace}, request=${result[name].request}`)
      } catch {
        logger.debug(`local dependency not found before metadata fetch: ${name}, request=${result[name].request}`)
      }

      const source = classifyDependencySource(result[name].request, {
        workspace: result[name].workspace,
        installed: !!result[name].resolved,
      })
      Object.assign(result[name], source)

      if (!result[name].local && !valid(result[name].request)) {
        result[name].invalid = true
        logger.debug(`dependency request is not exact semver: ${name}, request=${result[name].request}`)
      }

      const previous = this.depCache?.[name]
      const notFound = this.metadata.hasRecentNotFound(name)
      const preserved = reuseConfirmedDependencySource(
        previous,
        result[name],
        notFound,
      )
      if (preserved) Object.assign(result[name], preserved)
      if (previous?.latest && previous.request === result[name].request && previous.resolved === result[name].resolved) {
        result[name].latest = previous.latest
      }
    }
    const installed = Object.values(result).filter(dep => dep.resolved).length
    const invalid = Object.values(result).filter(dep => dep.invalid).length
    logger.info(`dependency local snapshot ready: total=${names.length}, installed=${installed}, invalid=${invalid}, elapsed=${Date.now() - start}ms`)
    return result
  }

  private async _refreshDependencyMetadata(result = this.depCache, serial = this.metadata.serial) {
    const start = Date.now()
    const names = Object.keys(result)
    const targets = names.filter((name) => !result[name].local && !result[name].invalid)
    logger.debug(`refresh dependency metadata started: total=${names.length}, targets=${targets.length}, concurrency=${this.config.concurrency ?? 4}, registry=${this.endpoint}, autoRoute=${this.config.autoRoute !== false}`)
    const probeName = pickMetadataProbe(targets)
    if (probeName) await this.metadata.ensureEndpoint(probeName, this.metadata.serial)
    logger.debug(`refresh dependency metadata route ready: probe=${probeName ?? '-'}, selected=${this.metadata.selectedEndpoint}, configured=${this.endpoint}, probed=${this.metadata.hasRouteProbeResult}`)
    await pMap(targets, async (name) => {
      if (this.isStale(serial)) return
      try {
        const versions = await this.getPackage(name)
        if (this.isStale(serial)) return
        if (versions) {
          result[name].latest = Object.keys(versions)[0]
          logger.debug(`dependency latest resolved: ${name}, resolved=${result[name].resolved ?? '-'}, latest=${result[name].latest}, versions=${Object.keys(versions).length}`)
        } else if (!versions && this.metadata.hasRecentNotFound(name) && this.markRegistryNotFoundDependency(name, result[name])) {
          logger.debug(`dependency npm not-found result reused from cache: ${name}`)
        } else {
          logger.debug(`dependency latest unresolved: ${name}, resolved=${result[name].resolved ?? '-'}, request=${result[name].request}`)
        }
      } catch (error) {
        if (this.isStale(serial)) return
        const detail = this.formatRegistryError(error)
        if (detail.reason === 'not-found' && this.markRegistryNotFoundDependency(name, result[name])) {
          // A definitive all-route 404 identifies an installed, registry-shaped plugin as local.
        } else {
          logger.debug(`dependency metadata refresh skipped after error: ${name}, reason=${detail.reason}, error=${detail.error}`)
        }
      }
    }, { concurrency: this.config.concurrency ?? 4 })
    logger.info(`dependency metadata refresh completed: total=${names.length}, targets=${targets.length}, registry=${this.metadata.selectedEndpoint}, elapsed=${Date.now() - start}ms`)
    if (!this.isStale(serial)) {
      this.depMetadataFresh = true
      this.ctx.get('console')?.refresh('dependencies')
    }
    return result
  }

  refreshDependencyMetadata(wait = false) {
    if (this.depMetadataFresh) return wait ? Promise.resolve(this.depCache) : undefined
    if (!this.depTask) {
      const task = this._refreshDependencyMetadata(this.depCache, this.metadata.serial)
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

  async probeDependenciesInBackground(reason = 'background') {
    const start = Date.now()
    if (this.depTask) {
      logger.debug(`reuse running dependency metadata task for ${reason} probe`)
      await this.depTask
      await this.refreshData()
      logger.info(`dependency ${reason} probe reused running metadata task: elapsed=${Date.now() - start}ms`)
      return
    }
    await this.metadata.reset(`dependency ${reason} probe superseded`)
    this.manifest = loadManifest(this.cwd)
    this.depTask = undefined
    this.depMetadataFresh = false
    this.depCache = this.getLocalDepsSnapshot()
    logger.info(`dependency ${reason} probe started: deps=${Object.keys(this.manifest.dependencies ?? {}).length}`)
    await this.refreshDependencyMetadata(true)
    await this.refreshData()
    logger.info(`dependency ${reason} probe completed: deps=${Object.keys(this.manifest.dependencies ?? {}).length}, elapsed=${Date.now() - start}ms`)
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
    await this.metadata.reset('dependency refresh superseded')
    this.manifest = loadManifest(this.cwd)
    this.depTask = undefined
    this.depMetadataFresh = false
    this.depCache = this.getLocalDepsSnapshot()
    const metadataTask = this.refreshDependencyMetadata(true)
    if (!refresh) return
    await this.refreshData()
    if (waitMetadata) await metadataTask
    logger.info(`dependency refresh requested by console: deps=${Object.keys(this.manifest.dependencies ?? {}).length}, waitMetadata=${waitMetadata}, elapsed=${Date.now() - start}ms`)
  }

  private startInstallLog(
    deps: Dict<string>,
    forced?: boolean,
    options: InstallOptions = {},
    changes: InstallHistoryChange[] = [],
  ) {
    return this.installHistory.start(deps, forced, options, changes)
  }

  private emitInstallLog(type: 'stdout' | 'stderr', line: string) {
    this.installHistory.emit(type, line)
  }

  private finishInstallLog(result?: { code?: number | null, failed?: boolean, reason?: string }) {
    return this.installHistory.finish(result)
  }

  getInstallHistory(limit = 20) {
    return this.installHistory.getHistory(limit)
  }

  getInstallLogDetail(id: string) {
    return this.installHistory.getDetail(id)
  }

  async getEnvironmentSnapshots(): Promise<EnvironmentSnapshotSummary[]> {
    const current = this.installActive
      ? await this.captureCurrentEnvironmentSnapshot('external')
      : await this.recordCurrentEnvironmentSnapshot('external')
    const snapshots = await this.environmentSnapshots.list()
    return snapshots.map(snapshot => summarizeEnvironmentSnapshot(snapshot, current.id))
  }

  async getEnvironmentSnapshotPreview(id: string): Promise<EnvironmentSnapshotPreview | undefined> {
    const target = await this.environmentSnapshots.get(id)
    if (!target) return
    const current = this.installActive
      ? await this.captureCurrentEnvironmentSnapshot('external')
      : await this.recordCurrentEnvironmentSnapshot('external')
    const changes = getEnvironmentDiff(current, target)
    return {
      snapshot: summarizeEnvironmentSnapshot(target, current.id),
      changes,
      actionableCount: changes.filter(change => !['unchanged', 'unsupported'].includes(change.status)).length,
      unsupportedCount: changes.filter(change => change.status === 'unsupported').length,
    }
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
      this.emitInstallLog('stdout', `package manager started: agent=${name}${this.agent?.version ? '@' + this.agent.version : ''}`)

      let stderr = ''
      let stdout = ''
      let settled = false

      const emitStdoutLine = (line: string) => {
        if (!line) return
        if (!useJson || line[0] !== '{') {
          logger.info(line)
          this.emitInstallLog('stdout', line)
          return
        }
        try {
          const { type, data } = JSON.parse(line) as YarnLog
          logger[levelMap[type] ?? 'info'](data)
          this.emitInstallLog('stdout', data)
        } catch (error) {
          logger.warn(line)
          logger.warn(error)
          this.emitInstallLog('stderr', line)
        }
      }

      const flushBuffers = () => {
        if (stderr) {
          logger.warn(stderr)
          this.emitInstallLog('stderr', stderr)
          stderr = ''
        }
        if (stdout) {
          emitStdoutLine(stdout)
          stdout = ''
        }
      }

      const settle = (code: number) => {
        if (settled) return
        settled = true
        flushBuffers()
        resolve(code)
      }

      child.on('exit', (code, signal) => {
        logger.info(`package manager exited: code=${code}, signal=${signal ?? '-'}, elapsed=${Date.now() - start}ms`)
        if (code == null) {
          const message = signal
            ? `package manager terminated by signal ${signal}`
            : 'package manager exited without an exit code'
          this.emitInstallLog('stderr', message)
          settle(-1)
          return
        }
        this.emitInstallLog(code ? 'stderr' : 'stdout', code ? `package manager exited with code ${code}` : 'package manager finished successfully')
        settle(code)
      })
      child.on('error', (error) => {
        logger.warn(`package manager failed to start: ${error instanceof Error ? error.message : String(error)}`)
        this.emitInstallLog('stderr', `package manager failed to start: ${error instanceof Error ? error.message : String(error)}`)
        settle(-1)
      })

      child.stderr.on('data', (data) => {
        data = stderr + data.toString()
        const lines = data.split('\n')
        stderr = lines.pop()!
        for (const line of lines) {
          logger.warn(line)
          this.emitInstallLog('stderr', line)
        }
      })

      child.stdout.on('data', (data) => {
        data = stdout + data.toString()
        const lines = data.split('\n')
        stdout = lines.pop()!
        for (const line of lines) emitStdoutLine(line)
      })
    })
  }

  async override(deps: Dict<string>) {
    const filename = resolve(this.cwd, 'package.json')
    logger.debug(`override package dependencies: file=${filename}, changes=${formatDeps(deps)}`)
    this.manifest.dependencies ||= {}
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

  private async snapshotPackageManifest(): Promise<PackageManifestSnapshot> {
    const filename = resolve(this.cwd, 'package.json')
    const content = await fsp.readFile(filename, 'utf8')
    const manifest: PackageJson = JSON.parse(content)
    manifest.dependencies ||= {}
    return {
      manifest,
      content,
      dependencies: { ...manifest.dependencies },
    }
  }

  private async restorePackageManifest(snapshot: PackageManifestSnapshot, deps: Dict<string>, reason: string) {
    const filename = resolve(this.cwd, 'package.json')
    let manifest: PackageJson
    try {
      manifest = JSON.parse(await fsp.readFile(filename, 'utf8'))
    } catch {
      manifest = JSON.parse(snapshot.content)
    }
    manifest.dependencies ||= {}
    for (const key of Object.keys(deps)) {
      if (Object.prototype.hasOwnProperty.call(snapshot.dependencies, key)) {
        manifest.dependencies[key] = snapshot.dependencies[key]
      } else {
        delete manifest.dependencies[key]
      }
    }
    manifest.dependencies = Object.fromEntries(Object.entries(manifest.dependencies).sort((a, b) => a[0].localeCompare(b[0])))
    await fsp.writeFile(filename, JSON.stringify(manifest, null, 2) + '\n')
    this.manifest = manifest
    this.depCache = this.getLocalDepsSnapshot()
    this.depMetadataFresh = false
    logger.warn(`package dependencies rolled back: reason=${reason}, changes=${formatDeps(deps)}, total=${Object.keys(this.manifest.dependencies ?? {}).length}`)
  }

  private _install(options: InstallOptions = {}) {
    options ||= {}
    const args: string[] = []
    const endpoint = options.installEndpoint || (this.config.endpoint ? this.endpoint : '')
    if (endpoint) {
      args.push('--registry', endpoint)
    }
    return this.exec(args)
  }

  private _getLocalDeps(override: Dict<string>) {
    return valueMap(override, (request, name) => {
      const dep = { request } as Dependency
      try {
        const meta = loadManifest(name, this.cwd)
        dep.resolved = meta.version
        dep.workspace = meta.$workspace
      } catch {}
      Object.assign(dep, classifyDependencySource(request, {
        workspace: dep.workspace,
        installed: !!dep.resolved,
      }))
      return dep
    })
  }

  private requiresPackageManager(deps: Dict<string>, localDeps: Dict<Dependency>, forced?: boolean) {
    if (forced) return true
    for (const name in deps) {
      const nextRequest = deps[name]
      const currentRequest = this.manifest.dependencies?.[name]
      const currentSource = classifyDependencySource(currentRequest ?? '', {
        workspace: this.depCache[name]?.workspace,
        installed: !!this.depCache[name]?.resolved,
      })
      const nextSource = classifyDependencySource(nextRequest ?? '', {
        workspace: localDeps[name]?.workspace,
        installed: !!localDeps[name]?.resolved,
      })
      if (!nextRequest) return true
      if (currentRequest !== nextRequest && (currentSource.local || nextSource.local)) return true
      const { resolved, local } = localDeps[name] || {}
      if (local || resolved && satisfies(resolved, nextRequest, { includePrerelease: true })) continue
      return true
    }
    return false
  }

  private async captureCurrentEnvironmentSnapshot(source: EnvironmentSnapshotSource, operationId?: string): Promise<EnvironmentSnapshot> {
    const manifest = await this.snapshotPackageManifest()
    const local = this._getLocalDeps(manifest.dependencies)
    const dependencies: Dict<EnvironmentDependencySnapshot> = {}
    for (const [name, request] of Object.entries(manifest.dependencies)) {
      const normalizedRequest = request.replace(/^[~^]/, '')
      dependencies[name] = {
        request,
        resolved: local[name]?.resolved,
        workspace: local[name]?.workspace,
        source: local[name]?.source,
        local: local[name]?.local,
        bound: local[name]?.bound,
        invalid: !local[name]?.local && !valid(normalizedRequest),
      }
    }
    return createEnvironmentSnapshot(dependencies, source, operationId)
  }

  private async recordCurrentEnvironmentSnapshot(source: EnvironmentSnapshotSource, operationId?: string) {
    const snapshot = await this.captureCurrentEnvironmentSnapshot(source, operationId)
    await this.environmentSnapshots.record(snapshot)
    return snapshot
  }

  private async _installLocked(deps: Dict<string>, forced?: boolean, beforeReload?: () => unknown | Promise<unknown>, options: InstallOptions = {}) {
    options ||= {}
    const start = Date.now()
    let resultCode: number | undefined
    let logResult: { code?: number | null, failed?: boolean, reason?: string } | undefined
    let snapshot: PackageManifestSnapshot | undefined
    let snapshotError: unknown
    try {
      snapshot = await this.snapshotPackageManifest()
    } catch (error) {
      snapshotError = error
    }
    const localDeps = this._getLocalDeps(deps)
    const changes = snapshot ? createInstallHistoryChanges(snapshot.dependencies, deps, localDeps) : []
    await this.recordCurrentEnvironmentSnapshot('external').catch((error) => {
      logger.warn(`failed to record pre-operation environment snapshot: ${error instanceof Error ? error.message : error}`)
    })
    await this.startInstallLog(deps, forced, options, changes).catch((error) => {
      this.installHistory.resetCurrent()
      logger.warn(`failed to start dependency install log: ${error instanceof Error ? error.message : error}`)
    })
    logger.info(`dependency install requested: deps=${formatDeps(deps)}, forced=${!!forced}, installEndpoint=${options.installEndpoint || '(default)'}`)
    try {
      this.emitInstallLog('stdout', `dependency install requested: ${formatDeps(deps) || '(none)'}`)
      if (options.installEndpoint) {
        this.emitInstallLog('stdout', `using temporary npm registry: ${options.installEndpoint}`)
      }
      if (snapshotError) throw snapshotError
      if (!snapshot) throw new Error('failed to snapshot package.json before dependency operation')
      logger.debug(`dependency install local state: ${formatLocalDeps(localDeps)}`)
      const needsPackageManager = this.requiresPackageManager(deps, localDeps, forced)

      if (needsPackageManager) {
        let sourceStateChanged = false
        // A fresh 404 cache avoids another network request in getPackage(), but it
        // still has to pass through markRegistryNotFoundDependency() before the
        // package-manager operation can be considered safe.
        const completedSourceChecks = Object.keys(this.fullCache)
        const unresolved = findDependenciesNeedingSourceCheck(this.depCache, deps, completedSourceChecks)
        if (unresolved.length) {
          logger.info(`resolve possible local plugin sources before package manager: ${unresolved.join(', ')}`)
          const unresolvedErrors = await Promise.all(unresolved.map(async (name) => {
            try {
              const versions = await this.getPackage(name)
              if (versions) return
              if (this.metadata.hasRecentNotFound(name)) {
                sourceStateChanged = this.markRegistryNotFoundDependency(name) || sourceStateChanged
                return
              }
              return {
                name,
                error: Object.assign(new Error('npm metadata check completed without a result'), {
                  marketNextReason: 'unknown',
                }),
              }
            } catch (error) {
              if (this.formatRegistryError(error).reason === 'not-found') {
                sourceStateChanged = this.markRegistryNotFoundDependency(name) || sourceStateChanged
                return
              }
              return { name, error }
            }
          }))
          const uncertain = unresolvedErrors.filter((item): item is { name: string, error: unknown } => {
            if (!item) return false
            return this.formatRegistryError(item.error).reason !== 'not-found'
          })
          if (sourceStateChanged) {
            await this.ctx.get('console')?.refresh('dependencies')
          }
          if (uncertain.length) {
            throw new Error(`暂时无法确认以下已安装插件是否来自 npm：${uncertain.map(item => item.name).join(', ')}。为避免包管理器误下载本地插件，本次操作已取消；请检查 npm 网络后重试。`)
          }
        }
        const blockers = findUnboundLocalDependencies(this.depCache, deps)
        if (blockers.length) {
          throw new Error(`检测到来源未绑定的本地插件，继续安装会让包管理器尝试从 npm 下载它们：${blockers.join(', ')}。请先在“本地插件”分组中绑定来源或移除这些依赖。`)
        }
      }

      await this.override(deps)
      this.emitInstallLog('stdout', 'package.json dependencies updated, preparing package manager workflow…')

      if (needsPackageManager) {
        this.emitInstallLog('stdout', 'running package manager install…')
        const code = await this._install(options)
        if (code) {
          resultCode = code
          logResult = { code }
          await this.restorePackageManifest(snapshot, deps, `package manager exited with code ${code}`)
          await this.refreshData()
          return code
        }
      }

      await this.refresh()
      const newDeps = await this.getDeps()
      let shouldReload = false
      for (const name in localDeps) {
        const { resolved } = localDeps[name]
        if (!newDeps[name]) continue
        const requestChanged = snapshot.dependencies[name] !== deps[name]
        const localRequestChanged = requestChanged && classifyDependencySource(deps[name] ?? '', {
          workspace: newDeps[name].workspace,
          installed: !!newDeps[name].resolved,
        }).local
        if (newDeps[name].resolved === resolved && !localRequestChanged) continue
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
        logger.debug('run pre-reload dependency hook')
        await beforeReload()
      }
      await this.refreshData()
      await this.recordCurrentEnvironmentSnapshot('operation', this.installHistory.currentId).catch((error) => {
        logger.warn(`failed to record dependency environment snapshot: ${error instanceof Error ? error.message : error}`)
      })
      logger.info(`dependency install completed: deps=${formatDeps(deps)}, forced=${!!needsPackageManager}, fullReload=${shouldReload}, elapsed=${Date.now() - start}ms`)
      if (shouldReload) {
        this.emitInstallLog('stdout', `full reload scheduled in ${FULL_RELOAD_DELAY}ms`)
        logger.info(`dependency install triggers full reload after ${FULL_RELOAD_DELAY}ms`)
        setTimeout(() => {
          if (this.ctx.scope.isActive) this.ctx.loader.fullReload()
        }, FULL_RELOAD_DELAY)
      }

      resultCode = 0
      logResult = { code: 0 }
      return 0
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logResult = {
        code: resultCode,
        failed: true,
        reason,
      }
      this.emitInstallLog('stderr', `dependency operation failed: ${reason}`)
      throw error
    } finally {
      await this.finishInstallLog(logResult).catch((error) => {
        logger.warn(`failed to finish dependency install log: ${error instanceof Error ? error.message : error}`)
      })
    }
  }

  private async withInstallLock<T>(description: string, callback: () => Promise<T>) {
    const previous = this.installTask
    let release: () => void
    this.installTask = new Promise<void>((resolve) => { release = resolve })
    if (this.installActive) logger.info(`dependency install queued: ${description}`)
    await previous
    this.installActive = true
    try {
      return await callback()
    } finally {
      this.installActive = false
      release!()
    }
  }

  private async queueInstall(deps: Dict<string>, forced?: boolean, beforeReload?: () => unknown | Promise<unknown>, options: InstallOptions = {}) {
    options ||= {}
    return this.withInstallLock(`deps=${formatDeps(deps)}`, () => {
      return this._installLocked(deps, forced, beforeReload, options)
    })
  }

  async install(deps: Dict<string>, forced?: boolean, beforeReload?: () => unknown | Promise<unknown>, options: InstallOptions = {}) {
    return this.queueInstall(deps, forced, beforeReload, options)
  }

  startLocalPackageUpload(request: LocalPackageUploadStartRequest): Promise<LocalPackageUploadStartResult> {
    return this.localPackageUploads.start(request)
  }

  appendLocalPackageUpload(request: LocalPackageUploadChunkRequest): Promise<LocalPackageUploadProgress> {
    return this.localPackageUploads.append(request)
  }

  async finishLocalPackageUpload(request: LocalPackageUploadFinishRequest): Promise<LocalPackageUploadPreview> {
    const result = await this.localPackageUploads.finish(request)
    const snapshot = await this.snapshotPackageManifest()
    const currentRequest = snapshot.dependencies[result.manifest.name]
    const currentVersion = this.depCache[result.manifest.name]?.resolved
    const scripts = Object.keys(result.manifest.scripts ?? {})
      .filter(name => ['preinstall', 'install', 'postinstall', 'prepare'].includes(name))
    return {
      uploadId: result.uploadId,
      filename: result.filename,
      name: result.manifest.name,
      version: result.manifest.version,
      description: typeof result.manifest.description === 'string' ? result.manifest.description : undefined,
      size: result.size,
      hash: result.hash,
      scripts,
      currentRequest,
      currentVersion,
      operation: getLocalPackageOperation(currentRequest, currentVersion, result.manifest.version),
    }
  }

  commitLocalPackageUpload(uploadId: string): Promise<LocalPackageUploadCommitResult> {
    return this.localPackageUploads.commit(uploadId)
  }

  cancelLocalPackageUpload(uploadId: string) {
    return this.localPackageUploads.cancel(uploadId)
  }

  async prepareLocalBinding(name: string): Promise<LocalBindingResult> {
    const packageSnapshot = await this.snapshotPackageManifest()
    return prepareLocalBindingPackage(
      this.cwd,
      name,
      this.depCache[name],
      packageSnapshot.dependencies,
      this.config.timeout,
    )
  }

  async applyEnvironmentSnapshot(id: string, options: InstallOptions = {}) {
    options ||= {}
    return this.withInstallLock(`environmentSnapshot=${id}`, async () => {
      const target = await this.environmentSnapshots.get(id)
      if (!target) throw new Error('目标环境版本不存在或已被清理。')
      const current = await this.captureCurrentEnvironmentSnapshot('external')
      const diff = getEnvironmentDiff(current, target)
      const unsupported = diff.filter(change => change.status === 'unsupported')
      if (unsupported.length) {
        throw new Error(`目标环境包含无法自动恢复的本地依赖：${unsupported.map(change => change.name).join(', ')}`)
      }
      const changes = getEnvironmentInstallChanges(diff, target)
      if (!Object.keys(changes).length) {
        await this.environmentSnapshots.record(current)
        return 0
      }
      logger.info(`environment snapshot restore requested: target=${id}, changes=${formatDeps(changes)}`)
      return this._installLocked(changes, true, undefined, options)
    })
  }

  isSelfUpdate(deps: Dict<string>) {
    return Object.prototype.hasOwnProperty.call(deps, SELF_PACKAGE)
  }
}

namespace Installer {
  export interface GetDepsOptions extends InstallerGetDepsOptions {}

  export interface Config extends InstallerConfig {}

  export const Config: Schema<Config> = Schema.object({
    endpoint: Schema.string().role('link'),
    timeout: Schema.number().role('time').default(Time.second * 5),
    autoRoute: Schema.boolean().default(true),
    retry: Schema.number().min(0).max(5).step(1).default(1),
    concurrency: Schema.number().min(1).max(16).step(1).default(4),
    installLogRetentionHours: Schema.number().min(1).max(24 * 365).step(1).default(72),
  }) // TODO .hidden()
}

export default Installer

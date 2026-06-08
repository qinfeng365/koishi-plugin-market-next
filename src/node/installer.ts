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
  private depTask: Promise<Dict<Dependency>>
  private metadataEndpoint: string
  private flushData: () => void
  private tempRegistryStatus: Dict<RegistryStatus> = {}
  private flushRegistryStatus: () => void
  private serial = 0

  constructor(public ctx: Context, public config: Installer.Config = {}) {
    super(ctx, 'installer')
    this.manifest = loadManifest(this.cwd)
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

  private async resetEndpoint() {
    const endpoint = this.config.endpoint || await getRegistry()
    this.endpoint = endpoint
    this.metadataEndpoint = endpoint
    this.http = this.createHttp(endpoint)
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
    return [this.metadataEndpoint || this.endpoint, this.endpoint, ...(this.config.autoRoute === false ? [] : REGISTRY_FALLBACK_ENDPOINTS)]
      .filter((endpoint, index, array): endpoint is string => !!endpoint && array.indexOf(endpoint) === index)
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
    const endpoints = this.getRegistryEndpoints()
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
    logger.debug(`registry metadata candidates for ${name}: endpoints=${endpoints.join(', ')}, retry=${maxRetry}, concurrency=${this.config.concurrency ?? 4}`)

    for (const endpoint of endpoints) {
      const http = endpoint === this.endpoint ? this.http : this.createHttp(endpoint)
      for (let retry = 0; retry <= maxRetry; retry++) {
        if (this.isStale(serial)) return
        attempts++
        lastEndpoint = endpoint
        this.setRegistryStatus(name, { loading: true, endpoint, attempts }, serial)
        const attemptStart = Date.now()
        try {
          logger.debug(`fetch registry metadata for ${name} from ${endpoint}, attempt=${retry + 1}/${maxRetry + 1}`)
          const registry = await http.get(`/${name}`) as Registry
          if (this.isStale(serial)) return
          if (!registry?.versions || typeof registry.versions !== 'object') {
            throw new Error(`invalid registry metadata for ${name}`)
          }
          if (endpoint !== this.metadataEndpoint) {
            logger.debug(`fallback npm registry endpoint for ${name}: ${endpoint}`)
            logger.info(`npm registry fallback selected for ${name}: endpoint=${endpoint}, previous=${this.metadataEndpoint}`)
            this.metadataEndpoint = endpoint
          }
          this.setRegistryStatus(name, {
            loading: false,
            error: undefined,
            reason: undefined,
            endpoint,
            attempts,
            elapsed: Date.now() - start,
          }, serial)
          logger.debug(`loaded registry metadata for ${name} from ${endpoint} in ${Date.now() - attemptStart}ms, versions=${Object.keys(registry.versions).length}`)
          return registry
        } catch (error) {
          lastError = error
          const detail = this.formatRegistryError(error)
          logger.debug(`failed registry metadata for ${name} from ${endpoint} in ${Date.now() - attemptStart}ms, attempt=${retry + 1}/${maxRetry + 1}: ${detail.error}`)
          if (detail.reason === 'not-found') break
          if (retry < maxRetry) await sleep(300 * (retry + 1))
        }
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
    if (!this.pkgTasks[name]) {
      const task = this._getPackage(name, this.serial)
      this.pkgTasks[name] = task
      task.then((versions) => {
        if (this.pkgTasks[name] !== task) return
        if (!versions) delete this.pkgTasks[name]
      }, () => {
        if (this.pkgTasks[name] !== task) return
        delete this.pkgTasks[name]
      })
    }
    return this.pkgTasks[name]
  }

  private async _getDeps() {
    const start = Date.now()
    const result = valueMap(this.manifest.dependencies, (request) => {
      return { request: request.replace(/^[~^]/, '') } as Dependency
    })
    logger.debug(`refresh dependency metadata started: total=${Object.keys(result).length}, concurrency=${this.config.concurrency ?? 4}, registry=${this.endpoint}`)
    await pMap(Object.keys(result), async (name) => {
      try {
        // some dependencies may be left with no local installation
        const meta = loadManifest(name)
        result[name].resolved = meta.version
        result[name].workspace = meta.$workspace
        logger.debug(`local dependency resolved: ${name}@${meta.version}, workspace=${!!meta.$workspace}, request=${result[name].request}`)
        if (meta.$workspace) return
      } catch {
        logger.debug(`local dependency not found before metadata fetch: ${name}, request=${result[name].request}`)
      }

      if (!valid(result[name].request)) {
        result[name].invalid = true
        logger.debug(`dependency request is not exact semver: ${name}, request=${result[name].request}`)
      }

      const versions = await this.getPackage(name)
      if (versions) {
        result[name].latest = Object.keys(versions)[0]
        logger.debug(`dependency latest resolved: ${name}, resolved=${result[name].resolved ?? '-'}, latest=${result[name].latest}, versions=${Object.keys(versions).length}`)
      } else {
        logger.debug(`dependency latest unresolved: ${name}, resolved=${result[name].resolved ?? '-'}, request=${result[name].request}`)
      }
    }, { concurrency: this.config.concurrency ?? 4 })
    const installed = Object.values(result).filter(dep => dep.resolved).length
    const invalid = Object.values(result).filter(dep => dep.invalid).length
    logger.info(`dependency metadata refresh completed: total=${Object.keys(result).length}, installed=${installed}, invalid=${invalid}, elapsed=${Date.now() - start}ms`)
    return result
  }

  getDeps() {
    return this.depTask ||= this._getDeps()
  }

  async refreshData() {
    await Promise.all([
      this.ctx.get('console')?.refresh('dependencies'),
      this.ctx.get('console')?.refresh('registry'),
      this.ctx.get('console')?.refresh('registryStatus'),
      this.ctx.get('console')?.refresh('packages'),
    ])
  }

  async refresh(refresh = false) {
    const start = Date.now()
    this.serial++
    await this.resetEndpoint()
    this.manifest = loadManifest(this.cwd)
    this.pkgTasks = {}
    this.fullCache = {}
    this.tempCache = {}
    this.clearRegistryStatus()
    this.depTask = this._getDeps()
    if (!refresh) return
    await this.refreshData()
    logger.info(`dependency refresh requested by console: deps=${Object.keys(this.manifest.dependencies ?? {}).length}, elapsed=${Date.now() - start}ms`)
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
            continue
          }
          try {
            const { type, data } = JSON.parse(line) as YarnLog
            logger[levelMap[type] ?? 'info'](data)
          } catch (error) {
            logger.warn(line)
            logger.warn(error)
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

export default Installer

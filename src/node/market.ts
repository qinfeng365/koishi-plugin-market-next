import { Context, Dict, HTTP, Schema, Time } from 'koishi'
import Scanner, { SearchObject, SearchResult } from '@koishijs/registry'
import { MarketProvider as BaseMarketProvider } from '../shared'
import { promises as fsp } from 'fs'
import { dirname, resolve } from 'path'

export const DEFAULT_ENDPOINT = 'https://registry.koishi.t4wefan.pub/index.json'
const FALLBACK_ENDPOINTS = [
  'https://registry.koishi.t4wefan.pub/index.json',
  'https://koi.nyan.zone/registry/index.json',
  'https://kp.itzdrli.cc',
]
const logLevels = ['silent', 'error', 'warn', 'info', 'debug'] as const

type LogLevel = typeof logLevels[number]

interface CacheFile {
  endpoint: string
  fetchedAt: number
  result: SearchResult
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
  private cacheMeta?: Omit<CacheFile, 'result'>
  private backgroundTask?: Promise<void>
  private flushData: () => void

  constructor(ctx: Context, public config: MarketProvider.Config = {}) {
    super(ctx)
    ctx.effect(() => () => {
      this.disposed = true
      this.serial++
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
        refreshing: false,
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
      this.applyIndex(result, this.endpoint)
      await this.writeDiskCache(result)
      this.cacheMeta = undefined
      this.log('info', `loaded market index from ${this.endpoint}: ${this.scanner.total}/${result.objects.length} objects, version=${this.scanner.version ?? 'legacy'}, elapsed=${Date.now() - start}ms`)
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

    this.log('debug', `collect market index completed, serial=${serial}, elapsed=${Date.now() - start}ms`)
    return null
  }

  private async fetchIndex(serial: number) {
    const endpoints = this.getEndpoints()
    this.log('debug', `market endpoint candidates: ${endpoints.join(', ')}`)

    if (endpoints.length === 1 || this.config.autoRoute === false) {
      const { endpoint, result } = await this.fetchEndpoint(endpoints[0], 0, endpoints.length, serial)
      this.endpoint = endpoint
      return result
    }

    this.log('debug', `race market endpoints concurrently, count=${endpoints.length}`)
    return new Promise<SearchResult>((resolve, reject) => {
      let settled = false
      let failed = 0
      let lastError: any

      endpoints.forEach((endpoint, index) => {
        this.fetchEndpoint(endpoint, index, endpoints.length, serial, false).then((data) => {
          if (settled) {
            this.log('debug', `ignore slower market endpoint ${data.endpoint}, elapsed=${data.elapsed}ms`)
            return
          }
          settled = true
          this.endpoint = data.endpoint
          if (data.endpoint !== this.config.endpoint) {
            this.log('info', `fallback market index endpoint: ${data.endpoint}`)
          }
          resolve(data.result)
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

  private async fetchEndpoint(endpoint: string, index: number, total: number, serial: number, warnFailure = true) {
    if (this.isStale(serial)) throw new Error('market provider disposed')
    const start = Date.now()
    try {
      const http: HTTP = this.ctx.http.extend({
        ...this.config,
        endpoint,
      })
      this.log('debug', `fetch market index from ${endpoint} (${index + 1}/${total}), timeout=${this.config.timeout ?? 'default'}, proxy=${this.config.proxyAgent ? 'yes' : 'no'}`)
      const result = await http.get<SearchResult>('')
      if (this.isStale(serial)) throw new Error('market provider disposed')
      if (!Array.isArray(result?.objects)) {
        throw new Error(`invalid market index from ${endpoint}`)
      }
      const elapsed = Date.now() - start
      this.log('debug', `market index fetched from ${endpoint} in ${elapsed}ms, objects=${result.objects.length}, version=${result.version ?? 'legacy'}`)
      return { endpoint, result, elapsed }
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
      return this.payload || { data: {}, failed: 0, total: 0, progress: 0 }
    }
    if (this._error) {
      if (this.payload) {
        const error = formatError(this._error)
        this.log('warn', `use cached market payload because current load failed: ${error}`)
        return {
          ...this.payload,
          stale: true,
          error,
          refreshing: false,
        }
      }
      this.log('debug', `get market payload failed without cache, error=${formatError(this._error)}, elapsed=${Date.now() - start}ms`)
      return { data: {}, failed: 0, total: 0, progress: 0 }
    }
    const payload = this.indexMode === 'modern' ? {
      registry: this.endpoint || this.ctx.installer.endpoint,
      data: Object.fromEntries(this.scanner.objects.map(item => [item.package.name, item])),
      failed: 0,
      total: this.scanner.total,
      progress: this.scanner.total,
      gravatar: process.env.GRAVATAR_MIRROR,
      stale: false,
      error: undefined,
      cached: !!this.cacheMeta,
      cachedAt: this.cacheMeta?.fetchedAt,
      refreshing: !!this.backgroundTask,
    } : {
      registry: this.endpoint || this.ctx.installer.endpoint,
      data: this.fullCache,
      failed: this.failed.length,
      total: this.scanner.total,
      progress: this.scanner.progress,
      gravatar: process.env.GRAVATAR_MIRROR,
      stale: false,
      error: undefined,
      cached: !!this.cacheMeta,
      cachedAt: this.cacheMeta?.fetchedAt,
      refreshing: !!this.backgroundTask,
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
    try {
      const cache = JSON.parse(await fsp.readFile(this.cacheFile, 'utf8')) as CacheFile
      if (!this.getEndpoints().includes(cache.endpoint)) {
        this.log('debug', `skip market disk cache from unrelated endpoint: ${cache.endpoint}`)
        return false
      }
      if (this.isStale(serial)) return false
      this.applyIndex(cache.result, cache.endpoint)
      this.cacheMeta = { endpoint: cache.endpoint, fetchedAt: cache.fetchedAt }
      this.log('info', `loaded market index from disk cache: ${this.scanner.total}/${cache.result.objects.length} objects, endpoint=${cache.endpoint}, cachedAt=${new Date(cache.fetchedAt).toISOString()}`)
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

  private async writeDiskCache(result: SearchResult) {
    try {
      const cache: CacheFile = {
        endpoint: this.endpoint,
        fetchedAt: Date.now(),
        result,
      }
      await fsp.mkdir(dirname(this.cacheFile), { recursive: true })
      await fsp.writeFile(this.cacheFile, JSON.stringify(cache))
      this.log('debug', `wrote market disk cache: endpoint=${cache.endpoint}, objects=${result.objects.length}`)
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
      this.applyIndex(result, this.endpoint)
      await this.writeDiskCache(result)
      this._error = null
      this.cacheMeta = undefined
      this.payload = undefined
      await this.ctx.get('console')?.refresh('market')
      this.log('info', `background market refresh completed in ${Date.now() - start}ms, endpoint=${this.endpoint}, objects=${this.scanner.total}`)
    } catch (error) {
      if (this.isStale(serial)) return
      this._error = error
      await this.ctx.get('console')?.refresh('market')
      this.log('warn', `background market refresh failed in ${Date.now() - start}ms: ${formatError(error)}`)
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

export default MarketProvider

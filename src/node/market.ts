import { Context, Dict, HTTP, Schema, Time } from 'koishi'
import Scanner, { SearchObject, SearchResult } from '@koishijs/registry'
import { MarketProvider as BaseMarketProvider } from '../shared'

export const DEFAULT_ENDPOINT = 'https://registry.koishi.t4wefan.pub/index.json'
const FALLBACK_ENDPOINTS = [
  'https://registry.koishi.t4wefan.pub/index.json',
  'https://koi.nyan.zone/registry/index.json',
  'https://kp.itzdrli.cc',
]
const logLevels = ['silent', 'error', 'warn', 'info', 'debug'] as const

type LogLevel = typeof logLevels[number]

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
  private flushData: () => void

  constructor(ctx: Context, public config: MarketProvider.Config = {}) {
    super(ctx)
    ctx.effect(() => () => {
      this.disposed = true
      this.serial++
    })
    config.endpoint ||= DEFAULT_ENDPOINT
    this.endpoint = config.endpoint
    this.http = ctx.http.extend(config)
    this.flushData = ctx.throttle(() => {
      if (this.disposed || !this.scanner || !ctx.scope.isActive) return
      ctx.console.broadcast('market/patch', {
        data: this.tempCache,
        failed: this.failed.length,
        total: this.scanner.total,
        progress: this.scanner.progress,
        stale: false,
        error: undefined,
      })
      this.tempCache = {}
    }, 500)
  }

  async start(refresh = false) {
    const serial = ++this.serial
    this.log('debug', `start market refresh=${refresh}`)
    this.failed = []
    this.fullCache = {}
    this.tempCache = {}
    let refreshTask: Promise<void>
    if (refresh) {
      this._task = null
      this._error = null
      refreshTask = this.ctx.installer.refresh(true).catch(error => this.ctx.logger('market').warn(error))
    }
    await super.start(refresh)
    if (this.isStale(serial)) return
    await refreshTask
  }

  async collect() {
    const serial = this.serial
    const { timeout } = this.config
    const registry = this.ctx.installer.http

    this.failed = []
    this.log('debug', 'collect market index')
    this.scanner = new Scanner(<T>(url: string, config?: { timeout?: number }) => registry.get<T>(url, config))
    if (this.http) {
      const result = await this.fetchIndex(serial)
      if (this.isStale(serial)) return null
      if (!Array.isArray(result?.objects)) {
        throw new Error(`invalid market index from ${this.endpoint}`)
      }
      this.scanner.objects = result.objects.filter(object => !object.ignored)
      this.scanner.total = this.scanner.objects.length
      this.scanner.version = result.version
      this.log('info', `loaded market index from ${this.endpoint}: ${this.scanner.total} objects, version=${this.scanner.version ?? 'legacy'}`)
    } else {
      await this.scanner.collect({ timeout })
    }

    if (!this.scanner.version) {
      this.scanner.analyze({
        version: '4',
        onFailure: (name, reason) => {
          this.failed.push(name)
          if (registry.config.endpoint.startsWith('https://registry.npmmirror.com')) {
            if (this.ctx.http.isError(reason) && reason.response?.status === 404) {
              // ignore 404 error for npmmirror
            }
          }
        },
        onRegistry: (registry, versions) => {
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
    }

    return null
  }

  private async fetchIndex(serial: number) {
    const endpoints = [this.config.endpoint, ...(this.config.autoRoute === false ? [] : FALLBACK_ENDPOINTS)]
      .filter((endpoint, index, array): endpoint is string => !!endpoint && array.indexOf(endpoint) === index)
    let lastError: any

    for (const endpoint of endpoints) {
      if (this.isStale(serial)) throw new Error('market provider disposed')
      const start = Date.now()
      try {
        const http: HTTP = this.ctx.http.extend({
          ...this.config,
          endpoint,
        })
        this.log('debug', `fetch market index from ${endpoint}`)
        const result = await http.get<SearchResult>('')
        if (this.isStale(serial)) throw new Error('market provider disposed')
        this.endpoint = endpoint
        if (endpoint !== this.config.endpoint) {
          this.log('info', `fallback market index endpoint: ${endpoint}`)
        }
        this.log('debug', `market index fetched from ${endpoint} in ${Date.now() - start}ms`)
        return result
      } catch (error) {
        lastError = error
        if (this.isStale(serial)) throw new Error('market provider disposed')
        this.log('warn', `failed to fetch market index from ${endpoint}: ${formatError(error)}`)
      }
    }

    throw lastError
  }

  async get() {
    await this.prepare()
    if (!this.scanner) {
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
        }
      }
      return { data: {}, failed: 0, total: 0, progress: 0 }
    }
    const payload = this.scanner.version ? {
      registry: this.endpoint || this.ctx.installer.endpoint,
      data: Object.fromEntries(this.scanner.objects.map(item => [item.package.name, item])),
      failed: 0,
      total: this.scanner.total,
      progress: this.scanner.total,
      gravatar: process.env.GRAVATAR_MIRROR,
      stale: false,
      error: undefined,
    } : {
      registry: this.endpoint || this.ctx.installer.endpoint,
      data: this.fullCache,
      failed: this.failed.length,
      total: this.scanner.total,
      progress: this.scanner.progress,
      gravatar: process.env.GRAVATAR_MIRROR,
      stale: false,
      error: undefined,
    }
    this.payload = payload
    return payload
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

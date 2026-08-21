import { Context, HTTP, Time } from 'koishi'
import {
  formatError,
  type LogLevel,
  type MarketProviderConfig,
} from './market-internals'

const PRIMARY_DISCOVERY_TIMEOUT = Time.second * 1.2
const VERSION_DISCOVERY_TIMEOUT = Time.second * 3
const VERSION_HASH_PATTERN = /^[a-f0-9]{64}$/

interface VersionedMarketSource {
  endpoint: string
  versionUrl: string
  authority: number
  authoritative?: boolean
}

export interface MarketVersionResolution {
  hash: string
  witnesses: string[]
  candidates: number
  elapsed: number
}

const versionedSources: VersionedMarketSource[] = [
  createSource('https://registry.koishi.chat/index.json', 100, true),
  createSource('https://raw.githubusercontent.com/koishijs/registry/release/index.json', 95, true),
  createSource('https://koishijs.github.io/registry/index.json', 90),
  createSource('https://registry.koishi.t4wefan.pub/index.json', 85),
  createSource('https://cdn.jsdelivr.net/gh/koishijs/registry@release/index.json', 70),
  createSource('https://ghfast.top/https://raw.githubusercontent.com/koishijs/registry/release/index.json', 65),
  createSource('https://ghproxy.net/https://raw.githubusercontent.com/koishijs/registry/release/index.json', 60),
]

const versionedSourceMap = new Map(versionedSources.map(source => [source.endpoint, source]))

function createSource(endpoint: string, authority: number, authoritative = false): VersionedMarketSource {
  return {
    endpoint,
    versionUrl: endpoint.replace(/index\.json$/, 'version.txt'),
    authority,
    authoritative,
  }
}

export function getVersionedMarketSource(endpoint: string) {
  return versionedSourceMap.get(endpoint)
}

export function getVersionedMarketIndexUrl(endpoint: string, hash: string) {
  const source = getVersionedMarketSource(endpoint)
  if (!source) return
  return endpoint.replace(/index\.json$/, `index.${hash}.json`)
}

export class MarketVersionResolver {
  constructor(
    private ctx: Context,
    private config: MarketProviderConfig,
    private log: (level: Exclude<LogLevel, 'silent'>, message: string) => void,
  ) {}

  resolve(endpoints: string[], signal?: AbortSignal): Promise<MarketVersionResolution | undefined> {
    const availableSources = endpoints
      .map(endpoint => getVersionedMarketSource(endpoint))
      .filter((source): source is VersionedMarketSource => !!source)
    const preferredEndpoints = [
      endpoints[0],
      'https://registry.koishi.chat/index.json',
      'https://registry.koishi.t4wefan.pub/index.json',
      'https://raw.githubusercontent.com/koishijs/registry/release/index.json',
      'https://koishijs.github.io/registry/index.json',
    ]
    const preferredIndex = new Map<string, number>()
    preferredEndpoints.forEach((endpoint, index) => {
      if (!preferredIndex.has(endpoint)) preferredIndex.set(endpoint, index)
    })
    const sources = availableSources.sort((a, b) => {
      const orderA = preferredIndex.get(a.endpoint) ?? preferredEndpoints.length + endpoints.indexOf(a.endpoint)
      const orderB = preferredIndex.get(b.endpoint) ?? preferredEndpoints.length + endpoints.indexOf(b.endpoint)
      return orderA - orderB
    })
    if (!sources.length) return Promise.resolve(undefined)

    const startedAt = Date.now()
    return new Promise((resolve, reject) => {
      let settled = false
      let secondaryStarted = false
      const controllers = sources.map(() => new AbortController())
      const votes = new Map<string, VersionedMarketSource[]>()
      const started = new Set<number>()
      const completed = new Set<number>()
      const primaryCount = Math.min(3, sources.length)
      const primaryTimer = setTimeout(() => {
        if (settled) return
        if (votes.size === 1) finish()
        else startSecondary()
      }, PRIMARY_DISCOVERY_TIMEOUT)
      const finalTimer = setTimeout(() => finish(), VERSION_DISCOVERY_TIMEOUT)

      const cleanup = () => {
        clearTimeout(primaryTimer)
        clearTimeout(finalTimer)
        signal?.removeEventListener('abort', onAbort)
        controllers.forEach(controller => controller.abort(new Error('market version discovery settled')))
      }

      const chooseHash = () => [...votes.entries()].sort((a, b) => {
        const countDelta = b[1].length - a[1].length
        if (countDelta) return countDelta
        const authoritativeDelta = Number(b[1].some(item => item.authoritative))
          - Number(a[1].some(item => item.authoritative))
        if (authoritativeDelta) return authoritativeDelta
        const authorityA = Math.max(...a[1].map(item => item.authority))
        const authorityB = Math.max(...b[1].map(item => item.authority))
        return authorityB - authorityA
      })[0]?.[0]

      const finish = (preferredHash?: string) => {
        if (settled) return
        settled = true
        cleanup()
        const hash = preferredHash ?? chooseHash()
        if (!hash) return resolve(undefined)
        const witnesses = votes.get(hash)?.map(source => source.endpoint) ?? []
        if (votes.size > 1) {
          this.log('warn', `market version witnesses disagreed: selected=${hash.slice(0, 12)}, votes=${[...votes.entries()].map(([value, items]) => `${value.slice(0, 12)}:${items.map(item => item.endpoint).join('+')}`).join(' | ')}`)
        }
        this.log('info', `market version resolved: hash=${hash.slice(0, 12)}, witnesses=${witnesses.join(', ')}, candidates=${sources.length}, elapsed=${Date.now() - startedAt}ms`)
        resolve({
          hash,
          witnesses,
          candidates: sources.length,
          elapsed: Date.now() - startedAt,
        })
      }

      const onAbort = () => {
        if (settled) return
        settled = true
        cleanup()
        reject(signal?.reason ?? new Error('market version discovery aborted'))
      }

      if (signal?.aborted) return onAbort()
      signal?.addEventListener('abort', onAbort, { once: true })

      const startProbe = (source: VersionedMarketSource, index: number) => {
        if (settled || started.has(index)) return
        started.add(index)
        this.fetchVersion(source, controllers[index].signal).then((hash) => {
          if (settled) return
          const witnesses = votes.get(hash) ?? []
          witnesses.push(source)
          votes.set(hash, witnesses)
          this.log('debug', `market version witness: endpoint=${source.endpoint}, hash=${hash.slice(0, 12)}, witnesses=${witnesses.length}`)
          if (source.authoritative || witnesses.reduce((sum, item) => sum + item.authority, 0) >= 160) {
            finish(hash)
          }
        }).catch((error) => {
          if (settled || this.isInternalAbort(error)) return
          this.log('debug', `market version witness failed: endpoint=${source.endpoint}, error=${formatError(error)}`)
        }).finally(() => {
          completed.add(index)
          if (settled) return
          const primaryComplete = [...Array(primaryCount).keys()].every(item => completed.has(item))
          if (!secondaryStarted && primaryComplete) {
            if (votes.size === 1) finish()
            else startSecondary()
            return
          }
          if (secondaryStarted && completed.size === started.size) finish()
        })
      }

      const startSecondary = () => {
        if (settled || secondaryStarted) return
        secondaryStarted = true
        this.log('debug', `market version primary witnesses unresolved; start secondary witnesses: count=${sources.length - primaryCount}`)
        sources.slice(primaryCount).forEach((source, offset) => startProbe(source, primaryCount + offset))
        if (completed.size === started.size) finish()
      }

      sources.slice(0, primaryCount).forEach(startProbe)
    })
  }

  private async fetchVersion(source: VersionedMarketSource, signal: AbortSignal) {
    const timeout = Math.min(this.config.timeout ?? VERSION_DISCOVERY_TIMEOUT, VERSION_DISCOVERY_TIMEOUT)
    const http: HTTP = this.ctx.http.extend({
      ...this.config,
      endpoint: source.versionUrl,
      timeout,
    })
    const response = await http<string>('', {
      responseType: 'text',
      signal,
      validateStatus: status => status >= 200 && status < 300,
    })
    const hash = String(response.data).trim().toLowerCase()
    if (!VERSION_HASH_PATTERN.test(hash)) {
      throw new Error(`invalid market version response from ${source.versionUrl}`)
    }
    return hash
  }

  private isInternalAbort(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return /version discovery settled|aborted|abort/i.test(message)
  }
}

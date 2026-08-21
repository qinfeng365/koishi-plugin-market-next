import { createHash } from 'crypto'
import { Context, HTTP } from 'koishi'
import type { SearchResult } from '@koishijs/registry'
import { MarketDiskCache } from './market-cache'
import {
  formatBytes,
  formatError,
  formatStack,
  formatTime,
  normalizeWireSize,
  parseContentLength,
  shortHash,
  type CacheEntry,
  type EndpointResult,
  type LogLevel,
  type MarketProviderConfig,
} from './market-internals'

interface MarketEndpointFetcherOptions {
  isStale: (serial: number) => boolean
  log: (level: Exclude<LogLevel, 'silent'>, message: string) => void
}

interface MarketEndpointRequest {
  endpoint: string
  index: number
  total: number
  serial: number
  warnFailure?: boolean
  signal?: AbortSignal
}

interface MarketEndpointResponse {
  status: number
  text: string
  requestElapsed: number
  etag?: string
  lastModified?: string
  contentEncoding?: string
  headerWireSize?: number
}

interface DecodedMarketResponse {
  text: string
  size: number
  wireSize?: number
  hash: string
  hashElapsed: number
}

export class MarketEndpointFetcher {
  constructor(
    private ctx: Context,
    private config: MarketProviderConfig,
    private cache: MarketDiskCache,
    private options: MarketEndpointFetcherOptions,
  ) {}

  async fetch(request: MarketEndpointRequest): Promise<EndpointResult> {
    const { endpoint, index, total, serial, warnFailure = true } = request
    this.assertActive(serial)
    const start = Date.now()
    try {
      const response = await this.requestEndpoint(request)
      this.assertActive(serial)
      const cached = this.cache.entries[endpoint]

      if (response.status === 304) {
        return this.reuseNotModified(endpoint, total, start, response, cached)
      }

      const decoded = this.decodeResponse(endpoint, response, cached)
      const hashCache = await this.reuseHashCache(endpoint, total, start, response, decoded, cached)
      if (hashCache) return hashCache
      if (cached && cached.hash === decoded.hash) {
        this.options.log('debug', `market cache hash matched but cached result is unavailable, parse network body instead: endpoint=${endpoint}, hash=${shortHash(decoded.hash)}`)
      }
      return this.parseNetworkResult(endpoint, total, start, response, decoded)
    } catch (error) {
      this.assertActive(serial)
      this.options.log(warnFailure ? 'warn' : 'debug', `failed to fetch market index from ${endpoint} in ${Date.now() - start}ms: ${formatError(error)}`)
      this.options.log('debug', `market endpoint error detail: endpoint=${endpoint}, index=${index + 1}/${total}, warn=${warnFailure}, elapsed=${Date.now() - start}ms, stack=${formatStack(error)}`)
      throw error
    }
  }

  private async requestEndpoint(request: MarketEndpointRequest): Promise<MarketEndpointResponse> {
    const { endpoint, index, total, signal } = request
    const http: HTTP = this.ctx.http.extend({
      ...this.config,
      endpoint,
    })
    const conditional = this.cache.getConditionalHeaders(endpoint)
    const headers = {
      'accept-encoding': 'br,gzip,deflate',
      ...conditional,
    }
    const requestStart = Date.now()
    this.options.log('debug', `fetch market index from ${endpoint} (${index + 1}/${total}), timeout=${this.config.timeout ?? 'default'}, proxy=${this.config.proxyAgent ? 'yes' : 'no'}, compression=yes, conditional=${Object.keys(conditional).length ? 'yes' : 'no'}`)
    this.options.log('debug', `market request headers: endpoint=${endpoint}, acceptEncoding=br,gzip,deflate, etag=${conditional['if-none-match'] ?? '-'}, lastModified=${conditional['if-modified-since'] ?? '-'}`)
    const response = await http<string>('', {
      responseType: 'text',
      headers,
      signal,
      validateStatus: status => status === 304 || status >= 200 && status < 300,
    })
    const requestElapsed = Date.now() - requestStart
    const etag = response.headers.get('etag') || undefined
    const lastModified = response.headers.get('last-modified') || undefined
    const contentEncoding = response.headers.get('content-encoding') || undefined
    const headerWireSize = parseContentLength(response.headers.get('content-length'))
    this.options.log('debug', `market response headers: endpoint=${endpoint}, status=${response.status}, request=${requestElapsed}ms, etag=${etag ?? '-'}, lastModified=${lastModified ?? '-'}, encoding=${contentEncoding ?? 'identity'}, contentLength=${formatBytes(headerWireSize)}`)
    return {
      status: response.status,
      text: response.data,
      requestElapsed,
      etag,
      lastModified,
      contentEncoding,
      headerWireSize,
    }
  }

  private async reuseNotModified(
    endpoint: string,
    total: number,
    start: number,
    response: MarketEndpointResponse,
    cached?: CacheEntry,
  ): Promise<EndpointResult> {
    const cache = cached && await this.cache.loadEntry(cached)
    if (!cache) throw new Error(`market index from ${endpoint} returned 304 without cache`)
    const elapsed = Date.now() - start
    const validatedAt = Date.now()
    this.options.log('debug', `market index not modified from ${endpoint} in ${elapsed}ms, reuse cache hash=${shortHash(cache.hash) || 'unknown'}`)
    this.options.log('info', `market index http-304: endpoint=${endpoint}, elapsed=${elapsed}ms, request=${response.requestElapsed}ms, cachedAt=${formatTime(cache.fetchedAt)}, hash=${shortHash(cache.hash) || 'unknown'}`)
    return {
      endpoint,
      result: cache.result,
      elapsed,
      candidates: total,
      source: 'http-304',
      timings: { request: response.requestElapsed, total: elapsed },
      size: cache.size,
      wireSize: response.headerWireSize ?? cache.wireSize,
      contentEncoding: response.contentEncoding ?? cache.contentEncoding,
      hash: cache.hash,
      etag: response.etag || cache.etag,
      lastModified: response.lastModified || cache.lastModified,
      cachedAt: cache.fetchedAt,
      validatedAt,
    }
  }

  private decodeResponse(endpoint: string, response: MarketEndpointResponse, cached?: CacheEntry): DecodedMarketResponse {
    const text = response.text
    const size = Buffer.byteLength(text)
    const wireSize = normalizeWireSize(response.headerWireSize, size)
    this.options.log('debug', `market response body decoded: endpoint=${endpoint}, chars=${text.length}, decodedSize=${formatBytes(size)}, wireSize=${formatBytes(wireSize)}, cachedHash=${shortHash(cached?.hash) ?? '-'}, cachedAt=${cached?.fetchedAt ? formatTime(cached.fetchedAt) : '-'}`)
    const hashStart = Date.now()
    const hash = createHash('sha256').update(text).digest('hex')
    const hashElapsed = Date.now() - hashStart
    this.options.log('debug', `market response hash computed: endpoint=${endpoint}, hash=${shortHash(hash) || 'unknown'}, elapsed=${hashElapsed}ms, unchanged=${!!cached && cached.hash === hash}`)
    return { text, size, wireSize, hash, hashElapsed }
  }

  private async reuseHashCache(
    endpoint: string,
    total: number,
    start: number,
    response: MarketEndpointResponse,
    decoded: DecodedMarketResponse,
    cached?: CacheEntry,
  ): Promise<EndpointResult | undefined> {
    const hashCache = cached && cached.hash === decoded.hash ? await this.cache.loadEntry(cached) : undefined
    if (!hashCache) return
    const elapsed = Date.now() - start
    const validatedAt = Date.now()
    this.options.log('debug', `market index hash unchanged from ${endpoint} in ${elapsed}ms, size=${decoded.size}, hash=${shortHash(decoded.hash)}`)
    this.options.log('info', `market index hash-cache: endpoint=${endpoint}, elapsed=${elapsed}ms, request=${response.requestElapsed}ms, hash=${shortHash(decoded.hash)}, size=${formatBytes(decoded.size)}, wireSize=${formatBytes(decoded.wireSize)}, encoding=${response.contentEncoding ?? 'identity'}`)
    return {
      endpoint,
      result: hashCache.result,
      elapsed,
      candidates: total,
      source: 'hash-cache',
      timings: { request: response.requestElapsed, hash: decoded.hashElapsed, total: elapsed },
      size: decoded.size,
      wireSize: decoded.wireSize,
      contentEncoding: response.contentEncoding,
      hash: decoded.hash,
      etag: response.etag,
      lastModified: response.lastModified,
      cachedAt: hashCache.fetchedAt,
      validatedAt,
    }
  }

  private parseNetworkResult(
    endpoint: string,
    total: number,
    start: number,
    response: MarketEndpointResponse,
    decoded: DecodedMarketResponse,
  ): EndpointResult {
    const parseStart = Date.now()
    this.options.log('debug', `market json parse started: endpoint=${endpoint}, decodedSize=${formatBytes(decoded.size)}`)
    const result: SearchResult = JSON.parse(decoded.text)
    const parseElapsed = Date.now() - parseStart
    if (!Array.isArray(result?.objects)) throw new Error(`invalid market index from ${endpoint}`)
    this.options.log('debug', `market json parse completed: endpoint=${endpoint}, objects=${result.objects.length}, version=${result.version ?? 'legacy'}, elapsed=${parseElapsed}ms`)
    const elapsed = Date.now() - start
    this.options.log('debug', `market index fetched from ${endpoint} in ${elapsed}ms, objects=${result.objects.length}, size=${decoded.size}, wireSize=${decoded.wireSize ?? 'unknown'}, encoding=${response.contentEncoding ?? 'identity'}, hash=${shortHash(decoded.hash) || 'unknown'}, version=${result.version ?? 'legacy'}`)
    this.options.log('info', `market index fetched: endpoint=${endpoint}, elapsed=${elapsed}ms, request=${response.requestElapsed}ms, hash=${decoded.hashElapsed}ms, json=${parseElapsed}ms, objects=${result.objects.length}, size=${formatBytes(decoded.size)}, wireSize=${formatBytes(decoded.wireSize)}, encoding=${response.contentEncoding ?? 'identity'}, hash=${shortHash(decoded.hash) || 'unknown'}, version=${result.version ?? 'legacy'}`)
    return {
      endpoint,
      result,
      elapsed,
      candidates: total,
      source: 'network',
      timings: { request: response.requestElapsed, hash: decoded.hashElapsed, parse: parseElapsed, total: elapsed },
      size: decoded.size,
      wireSize: decoded.wireSize,
      contentEncoding: response.contentEncoding,
      hash: decoded.hash,
      etag: response.etag,
      lastModified: response.lastModified,
    }
  }

  private assertActive(serial: number) {
    if (this.options.isStale(serial)) throw new Error('market provider disposed')
  }
}

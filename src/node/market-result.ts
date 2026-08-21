import type { MarketPerformanceSnapshot } from '../shared'
import { shortHash, type EndpointResult } from './market-internals'

export function createMarketResultSnapshot(result: EndpointResult, objects: number): MarketPerformanceSnapshot {
  return {
    source: result.source,
    endpoint: result.endpoint,
    preferredEndpoint: result.preferredEndpoint,
    fallbackReason: result.fallbackReason,
    candidates: result.candidates,
    size: result.size,
    wireSize: result.wireSize,
    contentEncoding: result.contentEncoding,
    objects,
    hash: shortHash(result.hash),
    etag: result.etag,
    lastModified: result.lastModified,
    cachedAt: result.cachedAt,
    validatedAt: result.validatedAt,
    timings: result.timings,
  }
}

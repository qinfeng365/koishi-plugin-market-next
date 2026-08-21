import assert from 'node:assert/strict'
import test from 'node:test'

import { createMarketResultSnapshot } from '../src/node/market-result.ts'

test('creates one stable performance snapshot from an endpoint result', () => {
  const timings = { request: 120, parse: 8, total: 140 }
  const snapshot = createMarketResultSnapshot({
    endpoint: 'https://registry.example/index.json',
    preferredEndpoint: 'https://registry.primary/index.json',
    fallbackReason: 'primary-slow',
    result: { version: 1, objects: [] },
    elapsed: 140,
    candidates: 4,
    source: 'network',
    timings,
    size: 4096,
    wireSize: 1024,
    contentEncoding: 'br',
    hash: '0123456789abcdef',
    etag: 'example-etag',
    lastModified: 'Fri, 21 Aug 2026 00:00:00 GMT',
    cachedAt: 100,
    validatedAt: 200,
  }, 42)

  assert.deepEqual(snapshot, {
    source: 'network',
    endpoint: 'https://registry.example/index.json',
    preferredEndpoint: 'https://registry.primary/index.json',
    fallbackReason: 'primary-slow',
    candidates: 4,
    size: 4096,
    wireSize: 1024,
    contentEncoding: 'br',
    objects: 42,
    hash: '0123456789ab',
    etag: 'example-etag',
    lastModified: 'Fri, 21 Aug 2026 00:00:00 GMT',
    cachedAt: 100,
    validatedAt: 200,
    timings,
  })
})

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { MarketRouter } from '../src/node/market-router.ts'

function createHeaders(values = {}) {
  const normalized = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]))
  return {
    get(name) {
      return normalized[name.toLowerCase()] ?? null
    },
  }
}

function wait(delay, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, delay)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

function createRouter(routes, primary, cacheEntries = {}) {
  let selected
  const logs = []
  const requests = []
  const ctx = {
    http: {
      extend({ endpoint }) {
        return async (_path, options = {}) => {
          requests.push(endpoint)
          const route = routes[endpoint]
          if (!route) throw new Error(`unexpected endpoint: ${endpoint}`)
          await wait(route.delay ?? 0, options.signal)
          if (route.error) throw route.error
          return {
            status: route.status ?? 200,
            data: route.data,
            headers: createHeaders(route.headers),
          }
        }
      },
    },
  }
  const cache = {
    entries: cacheEntries,
    getConditionalHeaders() {
      return {}
    },
    async loadEntry(entry) {
      return entry?.result ? entry : undefined
    },
    async findByHash(hash, endpoints) {
      return endpoints.map(endpoint => this.entries[endpoint]).find(entry => entry?.hash === hash && entry.result)
    },
    async getLatestGeneration(endpoints) {
      return Math.max(0, ...endpoints.map((endpoint) => {
        const result = this.entries[endpoint]?.result
        return (result?.forceTime ?? Date.parse(result?.time ?? '')) || 0
      })) || undefined
    },
    scheduleRouteStatsWrite() {},
  }
  const router = new MarketRouter(ctx, {
    endpoint: primary,
    autoRoute: true,
    timeout: 1000,
  }, cache, {
    isStale: () => false,
    selectEndpoint(endpoint) {
      selected = endpoint
    },
    onStatsChanged() {},
    log(level, message) {
      logs.push({ level, message })
    },
  })
  return {
    logs,
    requests,
    router,
    get selected() {
      return selected
    },
  }
}

test('continues the route race when the fastest endpoint returns invalid JSON', async () => {
  const primary = 'https://invalid.example/index.json'
  const fallback = 'https://valid.example/index.json'
  const state = createRouter({
    [primary]: {
      delay: 5,
      data: JSON.stringify({ version: 1, invalid: [] }),
    },
    [fallback]: {
      delay: 30,
      data: JSON.stringify({ version: 1, objects: [{ package: { name: 'koishi-plugin-valid' } }] }),
    },
  }, primary)

  const result = await state.router.fetchIndexFromEndpoints(1, [primary, fallback])

  assert.equal(result.endpoint, fallback)
  assert.equal(result.fallbackReason, 'primary-failed')
  assert.equal(result.result.objects[0].package.name, 'koishi-plugin-valid')
  assert.equal(state.selected, fallback)
  const scores = Object.fromEntries(state.router.getScores([primary, fallback]).map(item => [item.endpoint, item]))
  assert.equal(scores[primary].failures, 1)
  assert.equal(scores[fallback].successes, 1)
})

test('selects a valid fallback after the primary slow threshold and cancels the loser', async () => {
  const primary = 'https://slow.example/index.json'
  const fallback = 'https://fast.example/index.json'
  const state = createRouter({
    [primary]: {
      delay: 800,
      data: JSON.stringify({ version: 1, objects: [{ package: { name: 'koishi-plugin-slow' } }] }),
    },
    [fallback]: {
      delay: 10,
      data: JSON.stringify({ version: 1, objects: [{ package: { name: 'koishi-plugin-fast' } }] }),
    },
  }, primary)

  const result = await state.router.fetchIndexFromEndpoints(1, [primary, fallback])

  assert.equal(result.endpoint, fallback)
  assert.equal(result.fallbackReason, 'primary-slow')
  assert.equal(state.selected, fallback)
  const scores = Object.fromEntries(state.router.getScores([primary, fallback]).map(item => [item.endpoint, item]))
  assert.equal(scores[primary].failures ?? 0, 0)
  assert.equal(scores[fallback].successes, 1)
})

test('discards a stale speculative index and downloads the resolved content hash', async () => {
  const primary = 'https://registry.koishi.chat/index.json'
  const fallback = 'https://registry.koishi.t4wefan.pub/index.json'
  const latest = JSON.stringify({
    version: 6,
    time: 'Fri, 21 Aug 2026 06:32:13 GMT',
    forceTime: 1787293933827,
    total: 1,
    objects: [{ package: { name: 'koishi-plugin-latest', version: '2.0.0' } }],
  })
  const hash = createHash('sha256').update(latest).digest('hex')
  const stale = JSON.stringify({
    version: 6,
    time: 'Thu, 20 Aug 2026 19:14:55 GMT',
    forceTime: 1787253295000,
    total: 1,
    objects: [{ package: { name: 'koishi-plugin-latest', version: '1.0.0' } }],
  })
  const primaryVersion = primary.replace('index.json', 'version.txt')
  const fallbackVersion = fallback.replace('index.json', 'version.txt')
  const primaryIndex = primary.replace('index.json', `index.${hash}.json`)
  const state = createRouter({
    [primaryVersion]: { delay: 15, data: hash },
    [fallbackVersion]: { delay: 5, data: hash },
    [primary]: { delay: 5, data: stale },
    [primaryIndex]: { delay: 5, data: latest },
  }, primary)

  const result = await state.router.fetchIndex(1)

  assert.equal(result.endpoint, primary)
  assert.equal(result.hash, hash)
  assert.equal(result.result.objects[0].package.version, '2.0.0')
  assert.equal(state.requests.includes(primary), true)
  assert.equal(state.requests.includes(primaryIndex), true)
})

test('uses a matching speculative index without downloading it twice', async () => {
  const primary = 'https://registry.koishi.chat/index.json'
  const fallback = 'https://registry.koishi.t4wefan.pub/index.json'
  const latest = JSON.stringify({
    version: 6,
    forceTime: 1787293933827,
    objects: [{ package: { name: 'koishi-plugin-current', version: '1.0.0' } }],
  })
  const hash = createHash('sha256').update(latest).digest('hex')
  const hashedIndex = primary.replace('index.json', `index.${hash}.json`)
  const state = createRouter({
    [primary.replace('index.json', 'version.txt')]: { delay: 15, data: hash },
    [fallback.replace('index.json', 'version.txt')]: { delay: 5, data: hash },
    [primary]: { delay: 5, data: latest },
  }, primary)

  const result = await state.router.fetchIndex(1)

  assert.equal(result.hash, hash)
  assert.equal(result.endpoint, primary)
  assert.equal(state.requests.includes(primary), true)
  assert.equal(state.requests.includes(hashedIndex), false)
  assert.equal(state.requests.includes('https://cdn.jsdelivr.net/gh/koishijs/registry@release/version.txt'), false)
})

test('keeps the direct cold-start path when version witnesses are unavailable', async () => {
  const primary = 'https://registry.koishi.chat/index.json'
  const direct = JSON.stringify({
    version: 6,
    forceTime: 1787293933827,
    objects: [{ package: { name: 'koishi-plugin-direct', version: '1.0.0' } }],
  })
  const state = createRouter({
    [primary]: { delay: 20, data: direct },
  }, primary)

  const result = await state.router.fetchIndex(1)

  assert.equal(result.endpoint, primary)
  assert.equal(result.result.objects[0].package.name, 'koishi-plugin-direct')
  assert.equal(state.requests.filter(url => url === primary).length, 1)
})

test('reuses a cached payload when version witnesses report the same hash', async () => {
  const primary = 'https://registry.koishi.chat/index.json'
  const fallback = 'https://registry.koishi.t4wefan.pub/index.json'
  const result = {
    version: 6,
    time: 'Fri, 21 Aug 2026 06:32:13 GMT',
    forceTime: 1787293933827,
    total: 1,
    objects: [{ package: { name: 'koishi-plugin-cached', version: '1.0.0' } }],
  }
  const text = JSON.stringify(result)
  const hash = createHash('sha256').update(text).digest('hex')
  const state = createRouter({
    [primary.replace('index.json', 'version.txt')]: { delay: 10, data: hash },
    [fallback.replace('index.json', 'version.txt')]: { delay: 5, data: hash },
  }, primary, {
    [primary]: {
      endpoint: primary,
      fetchedAt: Date.now() - 1000,
      hash,
      size: text.length,
      result,
    },
  })

  const fetched = await state.router.fetchIndex(1)

  assert.equal(fetched.source, 'hash-cache')
  assert.equal(fetched.hash, hash)
  assert.equal(state.requests.some(url => url.includes(`index.${hash}.json`)), false)
})

test('does not regress to an older witnessed hash when a newer cache exists', async () => {
  const primary = 'https://registry.koishi.chat/index.json'
  const fallback = 'https://registry.koishi.t4wefan.pub/index.json'
  const oldResult = { version: 6, forceTime: 1000, objects: [] }
  const newResult = { version: 6, forceTime: 1_000_000, objects: [] }
  const oldText = JSON.stringify(oldResult)
  const newText = JSON.stringify(newResult)
  const oldHash = createHash('sha256').update(oldText).digest('hex')
  const newHash = createHash('sha256').update(newText).digest('hex')
  const state = createRouter({
    [primary.replace('index.json', 'version.txt')]: { delay: 10, data: oldHash },
    [fallback.replace('index.json', 'version.txt')]: { delay: 5, data: oldHash },
  }, primary, {
    [primary]: { endpoint: primary, fetchedAt: Date.now(), hash: oldHash, result: oldResult },
    [fallback]: { endpoint: fallback, fetchedAt: Date.now(), hash: newHash, result: newResult },
  })

  const result = await state.router.fetchVersionedIndex(1, [primary, fallback])

  assert.equal(result, undefined)
  assert.equal(state.requests.some(url => url.includes(`index.${oldHash}.json`)), false)
})

test('rejects a stale primary without treating it as a route failure', async () => {
  const primary = 'https://stale.example/index.json'
  const fallback = 'https://current.example/index.json'
  const state = createRouter({
    [primary]: {
      delay: 5,
      data: JSON.stringify({ version: 6, forceTime: 1000, objects: [] }),
    },
    [fallback]: {
      delay: 20,
      data: JSON.stringify({ version: 6, forceTime: 1_000_000, objects: [] }),
    },
  }, primary)

  const result = await state.router.fetchIndexFromEndpoints(1, [primary, fallback], {
    minimumGeneration: 1_000_000,
  })

  assert.equal(result.endpoint, fallback)
  assert.equal(result.fallbackReason, 'primary-stale')
  const scores = Object.fromEntries(state.router.getScores([primary, fallback]).map(item => [item.endpoint, item]))
  assert.equal(scores[primary].failures ?? 0, 0)
  assert.equal(scores[fallback].successes, 1)
})

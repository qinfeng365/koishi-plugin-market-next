import assert from 'node:assert/strict'
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

function createRouter(routes, primary) {
  let selected
  const logs = []
  const ctx = {
    http: {
      extend({ endpoint }) {
        return async (_path, options = {}) => {
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
    entries: {},
    getConditionalHeaders() {
      return {}
    },
    async loadEntry() {},
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

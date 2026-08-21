import assert from 'node:assert/strict'
import test from 'node:test'

import { getRegistryAttemptReasons } from '../src/shared/dependency-source.ts'
import { RegistryRouter } from '../src/node/registry-router.ts'

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

async function createRouter(routes, primary) {
  const calls = []
  const ctx = {
    baseDir: process.cwd(),
    scope: { isActive: true },
    http: {
      extend({ endpoint }) {
        return {
          async get(_path, options = {}) {
            calls.push(endpoint)
            const route = routes[endpoint]
            if (!route) throw new Error(`unexpected endpoint: ${endpoint}`)
            await wait(route.delay ?? 0, options.signal)
            if (route.error) throw route.error
            return route.registry
          },
        }
      },
      isError() {
        return false
      },
    },
  }
  const router = new RegistryRouter(ctx, {
    endpoint: primary,
    autoRoute: true,
    timeout: 1000,
  })
  await router.initializeEndpoint()
  return { calls, router }
}

function createRegistry(version = '1.0.0') {
  return { versions: { [version]: { version } } }
}

test('continues the npm registry race when the fastest endpoint returns invalid metadata', async () => {
  const primary = 'https://invalid.example'
  const fallback = 'https://valid.example'
  const state = await createRouter({
    [primary]: { delay: 5, registry: { invalid: true } },
    [fallback]: { delay: 20, registry: createRegistry() },
  }, primary)

  try {
    const result = await state.router.fetchRegistryByRoute('koishi-plugin-valid', [primary, fallback], state.router.serial)
    assert.equal(result.endpoint, fallback)
    assert.equal(result.fallbackReason, 'primary-failed')
    assert.deepEqual(result.registry, createRegistry())
  } finally {
    state.router.dispose()
  }
})

test('preserves every endpoint failure reason from an npm registry race', async () => {
  const primary = 'https://missing.example'
  const fallback = 'https://offline.example'
  const state = await createRouter({
    [primary]: { error: Object.assign(new Error('missing'), { marketNextReason: 'not-found' }) },
    [fallback]: { error: Object.assign(new Error('offline'), { marketNextReason: 'network' }) },
  }, primary)

  try {
    await assert.rejects(
      state.router.fetchRegistryByRoute('koishi-plugin-missing', [primary, fallback], state.router.serial),
      (error) => {
        assert.deepEqual(getRegistryAttemptReasons(error), ['not-found', 'network'])
        return true
      },
    )
  } finally {
    state.router.dispose()
  }
})

test('cancels staggered npm registry candidates after a fallback wins', async () => {
  const primary = 'https://failed.example'
  const fallback = 'https://fast.example'
  const slow = 'https://slow.example'
  const state = await createRouter({
    [primary]: { error: Object.assign(new Error('offline'), { marketNextReason: 'network' }) },
    [fallback]: { delay: 20, registry: createRegistry('2.0.0') },
    [slow]: { delay: 500, registry: createRegistry('3.0.0') },
  }, primary)

  try {
    const result = await state.router.fetchRegistryByRoute('koishi-plugin-fast', [primary, fallback, slow], state.router.serial)
    assert.equal(result.endpoint, fallback)
    assert.deepEqual(state.calls, [primary, fallback])
  } finally {
    state.router.dispose()
  }
})

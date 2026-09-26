import assert from 'node:assert/strict'
import test from 'node:test'

import { getRegistryAttemptReasons } from '../src/shared/dependency-source.ts'
import { RegistryMetadata } from '../src/node/registry-metadata.ts'
import { readPackageManagerRegistry, RegistryRouter, resolveRegistryEndpoint } from '../src/node/registry-router.ts'

test('refresh and new package metadata clear cached registry not-found results', async () => {
  const ctx = {
    baseDir: process.cwd(),
    scope: { isActive: true },
    get: () => undefined,
    throttle: callback => callback,
    http: { extend: () => ({}) },
  }
  const metadata = new RegistryMetadata(ctx, { endpoint: 'https://registry.npmjs.org' })
  metadata.notFoundCache.example = Date.now()
  assert.equal(metadata.hasRecentNotFound('example'), true)
  metadata.setPackage('example', [{ version: '1.0.0' }])
  assert.equal(metadata.hasRecentNotFound('example'), false)
  metadata.notFoundCache.example = Date.now()
  await metadata.reset('test refresh')
  assert.equal(metadata.hasRecentNotFound('example'), false)
  metadata.dispose()
})

test('reads the package manager registry with a bounded command timeout', async () => {
  let command
  const endpoint = await readPackageManagerRegistry({ cwd: '/koishi' }, async (name, args, options) => {
    command = { name, args, options }
    return { exitCode: 0, stdout: ' https://example.org/npm/\n' }
  })
  assert.equal(endpoint, 'https://example.org/npm/')
  assert.deepEqual(command.args, ['config', 'get', 'registry'])
  assert.equal(command.options.cwd, '/koishi')
  assert.equal(command.options.timeout, 3000)
})

test('failed package manager registry command is surfaced for fallback handling', async () => {
  await assert.rejects(
    readPackageManagerRegistry({ cwd: '/koishi' }, async () => ({ exitCode: 1, stdout: '' })),
    /code 1/,
  )
})

test('blank endpoint reads the registry from the Koishi instance directory', async () => {
  let readCwd
  const endpoint = await resolveRegistryEndpoint('', '/koishi', async ({ cwd }) => {
    readCwd = cwd
    return 'https://example.org/npm/'
  })
  assert.equal(readCwd, '/koishi')
  assert.equal(endpoint, 'https://example.org/npm/')
})

test('explicit endpoint does not invoke package manager config', async () => {
  const endpoint = await resolveRegistryEndpoint('https://custom.example', '/koishi', async () => {
    throw new Error('should not be called')
  })
  assert.equal(endpoint, 'https://custom.example')
})

test('failed package manager config uses the npm registry environment variable', async () => {
  const previous = process.env.npm_config_registry
  process.env.npm_config_registry = 'https://env.example/npm/'
  try {
    const endpoint = await resolveRegistryEndpoint('', '/koishi', async () => {
      throw new Error('child process exited with code 1')
    })
    assert.equal(endpoint, 'https://env.example/npm/')
  } finally {
    if (previous === undefined) delete process.env.npm_config_registry
    else process.env.npm_config_registry = previous
  }
})

test('invalid package manager config falls back to the official registry', async () => {
  const previousLower = process.env.npm_config_registry
  const previousUpper = process.env.NPM_CONFIG_REGISTRY
  delete process.env.npm_config_registry
  delete process.env.NPM_CONFIG_REGISTRY
  try {
    const endpoint = await resolveRegistryEndpoint('', '/koishi', async () => 'undefined')
    assert.equal(endpoint, 'https://registry.npmjs.org')
  } finally {
    if (previousLower === undefined) delete process.env.npm_config_registry
    else process.env.npm_config_registry = previousLower
    if (previousUpper === undefined) delete process.env.NPM_CONFIG_REGISTRY
    else process.env.NPM_CONFIG_REGISTRY = previousUpper
  }
})

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

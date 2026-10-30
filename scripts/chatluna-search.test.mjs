import assert from 'node:assert/strict'
import test from 'node:test'
import { tool } from '@langchain/core/tools'
import {
  CHATLUNA_TOOL_NAME,
  formatLoadError,
  formatSearchResult,
  normalizeInput,
  searchSchema,
} from '../src/node/chatluna-search.ts'

function plugin(overrides = {}) {
  return {
    package: {
      name: 'koishi-plugin-example',
      version: '1.2.3',
      description: 'An example adapter',
      keywords: ['adapter', 'example'],
      links: { npm: 'https://www.npmjs.com/package/koishi-plugin-example' },
    },
    shortname: 'example',
    downloads: { lastMonth: 1200 },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    verified: true,
    category: 'adapter',
    manifest: {},
    ...overrides,
  }
}

test('infers recent intent and clamps the requested result limit', () => {
  const input = normalizeInput({ createdWithinDays: 7, limit: 999 })
  assert.equal(input.intent, 'recent')
  assert.equal(input.sort, 'created')
  assert.equal(input.limit, 50)
})

test('filters hidden and deprecated objects before formatting the payload', () => {
  const input = normalizeInput({ includeDeprecated: false })
  const result = formatSearchResult({
    index: {
      endpoint: 'https://registry.example.test/index.json',
      fetchedAt: Date.now(),
      objects: [
        plugin(),
        plugin({ package: { ...plugin().package, name: 'koishi-plugin-old' }, deprecated: 'use another plugin' }),
        plugin({ package: { ...plugin().package, name: 'koishi-plugin-hidden' }, manifest: { hidden: true } }),
      ],
    },
    stale: false,
  }, input)
  const payload = JSON.parse(result)
  assert.equal(payload.total, 3)
  assert.equal(payload.matched, 1)
  assert.equal(payload.returned, 1)
  assert.equal(payload.results[0].name, 'koishi-plugin-example')
})

test('formats a load error as a stable empty result payload', () => {
  const input = normalizeInput({ query: 'adapter' })
  const payload = JSON.parse(formatLoadError('https://registry.example.test/index.json', input, new Error('network down')))
  assert.equal(payload.registry, 'https://registry.example.test/index.json')
  assert.equal(payload.error, 'network down')
  assert.equal(payload.results.length, 0)
  assert.equal(payload.matched, 0)
})

test('parses tool inputs with patched Zod and rejects out-of-range limits', () => {
  const input = searchSchema.parse({ names: 'example, second', status: ['verified'], limit: 5 })
  assert.deepEqual(input.names, ['example', 'second'])
  assert.deepEqual(input.status, ['verified'])
  assert.equal(input.limit, 5)
  assert.equal(searchSchema.safeParse({ limit: 51 }).success, false)
})

test('LangChain invokes the market schema with patched Zod without an LLM', async () => {
  const query = tool(async input => normalizeInput(input), {
    name: CHATLUNA_TOOL_NAME,
    description: 'Query the plugin market',
    schema: searchSchema,
  })
  const result = await query.invoke({ query: 'adapter', names: 'example', limit: 3 })
  assert.equal(result.query, 'adapter')
  assert.deepEqual(result.names, ['example'])
  assert.equal(result.limit, 3)
})

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import 'tsx/cjs'

const require = createRequire(import.meta.url)
const { Context } = require('koishi')
const { MarketDataStore } = require('../src/node/data.ts')

test('data store acknowledges concurrent patches after writing them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'market-next-data-'))
  try {
    const ctx = new Context()
    ctx.baseDir = root
    const store = new MarketDataStore(ctx)
    await Promise.all([
      store.patch({ override: { example: '1.0.0' } }),
      store.patch({ collapsedGroups: { updates: true } }),
    ])
    const saved = JSON.parse(await readFile(join(root, 'data', 'market-next.json'), 'utf8'))
    assert.equal(saved.override.example, '1.0.0')
    assert.equal(saved.collapsedGroups.updates, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('data store rejects a failed write without publishing the patch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'market-next-data-fail-'))
  try {
    await mkdir(join(root, 'data', 'market-next.json'), { recursive: true })
    const ctx = new Context()
    ctx.baseDir = root
    const store = new MarketDataStore(ctx)
    await assert.rejects(store.patch({ override: { example: '1.0.0' } }))
    assert.deepEqual((await store.get()).override, {})
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('data store takes bulkMode over from koishi.yml and keeps it as a boolean', async () => {
  const root = await mkdtemp(join(tmpdir(), 'market-next-data-bulk-'))
  try {
    const ctx = new Context()
    ctx.baseDir = root
    const store = new MarketDataStore(ctx)
    await store.migrateFromConfig({ bulkMode: true })
    assert.equal((await store.get()).bulkMode, true)
    await store.patch({ bulkMode: 0 })
    const saved = JSON.parse(await readFile(join(root, 'data', 'market-next.json'), 'utf8'))
    assert.equal(saved.bulkMode, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('data store keeps its own bulkMode once it has one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'market-next-data-bulk-keep-'))
  try {
    const ctx = new Context()
    ctx.baseDir = root
    const store = new MarketDataStore(ctx)
    await store.patch({ bulkMode: false })
    await store.migrateFromConfig({ bulkMode: true })
    assert.equal((await store.get()).bulkMode, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

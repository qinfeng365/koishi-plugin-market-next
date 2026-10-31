import 'yml-register'
import assert from 'node:assert/strict'
import test from 'node:test'

import { Config, ensureMarketNextConfigDefaults, updateMarketNextConfig } from '../src/node/config.ts'

test('prefers the active market-next node over disabled matches in groups', () => {
  const disabled = { frontendMode: 'polished' }
  const active = { depsLayout: 'broken' }
  const plugins = {
    '~group:old': { 'market-next:old': disabled },
    'group:current': { 'market-next:active': active },
  }
  const ctx = { loader: { config: { plugins } } }
  assert.equal(ensureMarketNextConfigDefaults(ctx, {}), true)
  assert.equal(active.depsLayout, 'grid')
  assert.equal(disabled.frontendMode, 'polished')
})

test('prefers the current instance when multiple active nodes exist', () => {
  const first = { depsLayout: 'broken' }
  const current = { depsLayout: 'broken' }
  const ctx = { loader: { config: { plugins: {
    'market-next:first': first,
    'group:second': { 'market-next:second': current },
  } } } }
  assert.equal(ensureMarketNextConfigDefaults(ctx, current), true)
  assert.equal(first.depsLayout, 'broken')
  assert.equal(current.depsLayout, 'grid')
})

test('removes legacy frontend mode without changing the dependency layout', () => {
  for (const frontendMode of ['performance', 'polished', 'broken', undefined]) {
    const current = { frontendMode, depsLayout: 'list' }
    const ctx = { loader: { config: { plugins: { 'market-next:current': current } } } }
    assert.equal(ensureMarketNextConfigDefaults(ctx, current), true)
    assert.equal(Object.hasOwn(current, 'frontendMode'), false)
    assert.equal(current.depsLayout, 'list')
    assert.equal(ensureMarketNextConfigDefaults(ctx, current), false)
  }
})

test('does not generate a frontend mode default or expose its schema', () => {
  const current = { depsLayout: 'grid' }
  const ctx = { loader: { config: { plugins: { 'market-next:current': current } } } }
  assert.equal(ensureMarketNextConfigDefaults(ctx, current), false)
  assert.equal(Object.hasOwn(current, 'frontendMode'), false)
  assert.equal(Object.hasOwn(Config.dict, 'frontendMode'), false)
})

test('rejects legacy frontend mode patches without writing config', async () => {
  const current = { depsLayout: 'grid' }
  let writes = 0
  const ctx = { loader: {
    config: { plugins: { 'market-next:current': current } },
    writeConfig: async () => { writes++ },
  } }
  assert.equal(await updateMarketNextConfig(ctx, current, { frontendMode: 'polished' }), false)
  assert.equal(writes, 0)
  assert.equal(Object.hasOwn(current, 'frontendMode'), false)
})

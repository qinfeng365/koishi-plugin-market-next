import 'yml-register'
import assert from 'node:assert/strict'
import test from 'node:test'

import { ensureMarketNextConfigDefaults } from '../src/node/config.ts'

test('prefers the active market-next node over disabled matches in groups', () => {
  const disabled = { frontendMode: 'polished' }
  const active = { frontendMode: 'broken' }
  const plugins = {
    '~group:old': { 'market-next:old': disabled },
    'group:current': { 'market-next:active': active },
  }
  const ctx = { loader: { config: { plugins } } }
  assert.equal(ensureMarketNextConfigDefaults(ctx, {}), true)
  assert.equal(active.frontendMode, 'performance')
  assert.equal(disabled.frontendMode, 'polished')
})

test('prefers the current instance when multiple active nodes exist', () => {
  const first = { frontendMode: 'broken' }
  const current = { frontendMode: 'broken' }
  const ctx = { loader: { config: { plugins: {
    'market-next:first': first,
    'group:second': { 'market-next:second': current },
  } } } }
  assert.equal(ensureMarketNextConfigDefaults(ctx, current), true)
  assert.equal(first.frontendMode, 'broken')
  assert.equal(current.frontendMode, 'performance')
})

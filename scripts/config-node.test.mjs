import 'yml-register'
import assert from 'node:assert/strict'
import test from 'node:test'

import { ensureMarketNextConfigDefaults } from '../src/node/config.ts'
import { listPluginConfigs } from '../src/node/plugin-config.ts'

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

test('converts legacy millisecond time options to the units shown in the config page', () => {
  const node = {
    frontendMode: 'performance',
    depsLayout: 'grid',
    idleProbeDelay: 600000,
    idleProbeInterval: 10000,
    registry: { timeout: 500 },
    search: { timeout: 45000, timeoutSeconds: 20 },
  }
  const current = { idleProbeDelayMinutes: 5 }
  const ctx = { loader: { config: { plugins: { 'market-next:main': node } } } }
  assert.equal(ensureMarketNextConfigDefaults(ctx, current), true)
  assert.equal(node.idleProbeDelayMinutes, 10)
  assert.equal(node.idleProbeIntervalHours, 0.0028)
  assert.equal(node.registry.timeoutSeconds, 1)
  assert.equal(node.search.timeoutSeconds, 20)
  assert.equal('idleProbeDelay' in node, false)
  assert.equal('timeout' in node.registry, false)
  assert.equal(current.idleProbeDelayMinutes, 10)
  assert.equal(current.registry.timeoutSeconds, 1)
})

test('keeps a legacy timeout of 0 as no limit and converts retention and ignore durations to days', () => {
  const node = {
    frontendMode: 'performance',
    depsLayout: 'grid',
    updateIgnoreDuration: 7 * 24 * 3600 * 1000,
    registry: { timeout: 0, installLogRetentionHours: 12 },
    search: { timeout: 0 },
  }
  const current = {}
  const ctx = { loader: { config: { plugins: { 'market-next:main': node } } } }
  assert.equal(ensureMarketNextConfigDefaults(ctx, current), true)
  assert.equal(node.registry.timeoutSeconds, 0)
  assert.equal(node.search.timeoutSeconds, 0)
  assert.equal(node.registry.installLogRetentionDays, 1)
  assert.equal(node.updateIgnoreDays, 7)
  assert.equal('installLogRetentionHours' in node.registry, false)
  assert.equal('updateIgnoreDuration' in node, false)
  assert.equal(current.updateIgnoreDays, 7)
})

test('drops a legacy retention of 0 so the schema default applies', () => {
  const node = { frontendMode: 'performance', depsLayout: 'grid', registry: { installLogRetention: 0 } }
  const current = { registry: { installLogRetentionDays: 3 } }
  const ctx = { loader: { config: { plugins: { 'market-next:main': node } } } }
  assert.equal(ensureMarketNextConfigDefaults(ctx, current), true)
  assert.equal('installLogRetentionDays' in node.registry, false)
  assert.equal('installLogRetention' in node.registry, false)
  assert.equal(current.registry.installLogRetentionDays, 3)
})

test('moves search.logLevel to the top-level log level unless one is already set', () => {
  const legacy = { frontendMode: 'performance', depsLayout: 'grid', search: { logLevel: 'debug' } }
  const current = { logLevel: 'warn' }
  assert.equal(ensureMarketNextConfigDefaults({ loader: { config: { plugins: { 'market-next:a': legacy } } } }, current), true)
  assert.equal(legacy.logLevel, 'debug')
  assert.equal('logLevel' in legacy.search, false)
  assert.equal(current.logLevel, 'debug')

  const both = { frontendMode: 'performance', depsLayout: 'grid', logLevel: 'info', search: { logLevel: 'debug' } }
  assert.equal(ensureMarketNextConfigDefaults({ loader: { config: { plugins: { 'market-next:b': both } } } }, {}), true)
  assert.equal(both.logLevel, 'info')
})

test('rounds migrated log retention to whole days within the schema range', () => {
  const node = { frontendMode: 'performance', depsLayout: 'grid', registry: { installLogRetentionHours: 36 } }
  const ctx = { loader: { config: { plugins: { 'market-next:main': node } } } }
  ensureMarketNextConfigDefaults(ctx, {})
  assert.equal(node.registry.installLogRetentionDays, 2)
  const long = { frontendMode: 'performance', depsLayout: 'grid', registry: { installLogRetention: 400 * 24 * 3600 * 1000 } }
  ensureMarketNextConfigDefaults({ loader: { config: { plugins: { 'market-next:main': long } } } }, {})
  assert.equal(long.registry.installLogRetentionDays, 365)
})

test('lists every configured plugin, including disabled entries and ones behind $if', () => {
  const plugins = {
    $collapsed: true,
    'android:a': { $if: 'false' },
    '~logger:b': {},
    'group:c': {
      $if: 'false',
      'adapter-qq:d': {},
      '~group:e': { '@scope/echo:f': {} },
    },
  }
  assert.deepEqual([...listPluginConfigs(plugins)].sort(), ['@scope/echo', 'adapter-qq', 'android', 'logger'])
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { isPrimaryBypassed, scoreRouteHealth } from '../src/node/route-health.ts'

const now = Date.UTC(2026, 7, 21)

test('keeps the caller-provided base score when no route history exists', () => {
  assert.equal(scoreRouteHealth(undefined, {
    baseScore: 1.5,
    fastThreshold: 500,
    now,
  }), 1.5)
})

test('uses the route-specific fast threshold without changing shared latency tiers', () => {
  const stats = { score: 0, successes: 0, failures: 0, averageElapsed: 700 }
  assert.equal(scoreRouteHealth(stats, {
    fastThreshold: 500,
    now,
  }), 0.5)
  assert.equal(scoreRouteHealth(stats, {
    fastThreshold: 800,
    now,
  }), 1)
})

test('applies compression rewards only when the route enables them', () => {
  const stats = { score: 0, successes: 0, failures: 0, contentEncoding: 'br' }
  assert.equal(scoreRouteHealth(stats, {
    fastThreshold: 500,
    now,
  }), 0)
  assert.equal(scoreRouteHealth(stats, {
    fastThreshold: 500,
    now,
    compressionBonus: true,
  }), 0.5)
})

test('balances recent success against consecutive source failures', () => {
  const stats = {
    score: 0,
    successes: 0,
    failures: 0,
    consecutiveFailures: 2,
    lastSuccess: now - 60_000,
  }
  assert.equal(scoreRouteHealth(stats, {
    fastThreshold: 500,
    now,
  }), -1.5)
})

test('preserves the existing success-rate and history weighting', () => {
  const stats = {
    score: 0.5,
    successes: 8,
    failures: 2,
  }
  assert.equal(scoreRouteHealth(stats, {
    baseScore: 1,
    fastThreshold: 500,
    now,
  }), 6.4)
})

test('bypasses the configured source only after enough failures and only for a while', () => {
  const minute = 60_000
  const config = { autoRoute: true, primaryFailureLimit: 3, primaryBypassMinutes: 5 }
  assert.equal(isPrimaryBypassed({ consecutiveFailures: 2, lastFailure: 1 }, config, minute), false)
  assert.equal(isPrimaryBypassed({ consecutiveFailures: 3, lastFailure: 1 }, config, minute), true)
  assert.equal(isPrimaryBypassed({ consecutiveFailures: 3, lastFailure: 1 }, config, 6 * minute), false)
  assert.equal(isPrimaryBypassed({ consecutiveFailures: 3, lastFailure: 1 }, { ...config, primaryFailureLimit: 0 }, minute), false)
  assert.equal(isPrimaryBypassed({ consecutiveFailures: 3, lastFailure: 1 }, { ...config, autoRoute: false }, minute), false)
})

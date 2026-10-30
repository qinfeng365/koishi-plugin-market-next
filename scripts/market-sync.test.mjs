import assert from 'node:assert/strict'
import test from 'node:test'

import { findMarketUpdates } from '../src/node/market-sync.ts'

const market = (version) => ({ package: { version } })

test('picks installed dependencies whose market release is newer', () => {
  const deps = {
    a: { latest: '1.0.0', resolved: '1.0.0' },
    b: { latest: '2.0.0', resolved: '2.0.0' },
    c: { latest: '1.0.0', resolved: '1.0.0', local: true },
    d: { latest: '1.0.0', resolved: '1.0.0', workspace: true },
    e: {},
    f: { latest: '1.0.0' },
  }
  const data = { a: market('1.1.0'), b: market('2.0.0'), c: market('2.0.0'), d: market('2.0.0'), e: market('1.0.0'), f: market('2.0.0') }
  assert.deepEqual(findMarketUpdates(deps, data, new Map(), 0), ['a'])
})

test('rechecks the same release only after the interval', () => {
  const deps = { a: { latest: '1.0.0', resolved: '1.0.0' } }
  const data = { a: market('1.1.0') }
  const checked = new Map()
  assert.deepEqual(findMarketUpdates(deps, data, checked, 0), ['a'])
  assert.deepEqual(findMarketUpdates(deps, data, checked, 60_000), [])
  assert.deepEqual(findMarketUpdates(deps, data, checked, 11 * 60_000), ['a'])
  assert.deepEqual(findMarketUpdates(deps, { a: market('1.2.0') }, checked, 11 * 60_000 + 1), ['a'])
})

test('gives up on a release after a few attempts', () => {
  const deps = { a: { latest: '1.0.0', resolved: '1.0.0' } }
  const data = { a: market('1.1.0') }
  const checked = new Map()
  const minutes = (count) => count * 60_000
  for (let attempt = 0; attempt < 6; attempt++) {
    assert.deepEqual(findMarketUpdates(deps, data, checked, minutes(attempt * 11)), ['a'])
  }
  assert.deepEqual(findMarketUpdates(deps, data, checked, minutes(120)), [])
})

test('drops records of releases that are no longer pending', () => {
  const checked = new Map()
  findMarketUpdates({ a: { latest: '1.0.0', resolved: '1.0.0' } }, { a: market('1.1.0') }, checked, 0)
  assert.equal(checked.size, 1)
  findMarketUpdates({ a: { latest: '1.1.0', resolved: '1.0.0' } }, { a: market('1.1.0') }, checked, 1)
  assert.equal(checked.size, 0)
})

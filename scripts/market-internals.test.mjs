import assert from 'node:assert/strict'
import test from 'node:test'

import { parseContentLength } from '../src/node/market-internals.ts'

test('ignores zero content length so HTTP 304 responses retain cached wire size', () => {
  assert.equal(parseContentLength('0'), undefined)
  assert.equal(parseContentLength('-1'), undefined)
  assert.equal(parseContentLength('invalid'), undefined)
  assert.equal(parseContentLength('752600'), 752600)
})

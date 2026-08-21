import assert from 'node:assert/strict'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

import { MarketSnapshotTransport } from '../src/node/market-snapshot.ts'

function createContext() {
  return {
    logger() {
      return { debug() {} }
    },
  }
}

function createSnapshot(data, dataVersion) {
  return {
    data,
    dataVersion,
    failed: 0,
    total: Object.keys(data).length,
    progress: Object.keys(data).length,
  }
}

function getSnapshotId(transfer) {
  return transfer.url.slice(transfer.url.lastIndexOf('/') + 1)
}

test('reuses an encoded market snapshot while its data version is unchanged', async () => {
  const transport = new MarketSnapshotTransport(createContext(), '/snapshot')
  const data = {
    'koishi-plugin-example': {
      package: { name: 'koishi-plugin-example', version: '1.0.0' },
    },
  }
  const originalStringify = JSON.stringify
  let stringifyCalls = 0
  JSON.stringify = function (...args) {
    stringifyCalls++
    return originalStringify.apply(this, args)
  }

  try {
    const first = await transport.create(createSnapshot(data, 1))
    const second = await transport.create(createSnapshot(data, 1))

    assert.equal(second.url, first.url)
    assert.equal(stringifyCalls, 1)
  } finally {
    JSON.stringify = originalStringify
  }
})

test('re-encodes a reused data object after its version changes', async () => {
  const transport = new MarketSnapshotTransport(createContext(), '/snapshot')
  const data = {
    'koishi-plugin-example': {
      package: { name: 'koishi-plugin-example', version: '1.0.0' },
    },
  }
  const first = await transport.create(createSnapshot(data, 1))

  data['koishi-plugin-example'].package.version = '2.0.0'
  const second = await transport.create(createSnapshot(data, 2))

  assert.notEqual(second.url, first.url)
  const entry = transport.get(getSnapshotId(second))
  const decoded = JSON.parse(gunzipSync(entry.body).toString('utf8'))
  assert.equal(decoded['koishi-plugin-example'].package.version, '2.0.0')
})

test('clears encoded market snapshots and their identity memo', async () => {
  const transport = new MarketSnapshotTransport(createContext(), '/snapshot')
  const data = {
    'koishi-plugin-example': {
      package: { name: 'koishi-plugin-example', version: '1.0.0' },
    },
  }
  const first = await transport.create(createSnapshot(data, 1))
  const firstId = getSnapshotId(first)

  transport.clear()
  assert.equal(transport.get(firstId), undefined)

  const second = await transport.create(createSnapshot(data, 1))
  assert.ok(transport.get(getSnapshotId(second)))
})

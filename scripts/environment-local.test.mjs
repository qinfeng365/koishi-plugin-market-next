import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createEnvironmentSnapshot,
  getEnvironmentDiff,
  getEnvironmentInstallChanges,
} from '../src/node/environment.ts'

test('treats local dependency changes as unsupported and preserves their requests', () => {
  const current = createEnvironmentSnapshot({
    'koishi-plugin-local': {
      request: 'file:F:/plugins/local',
      resolved: '1.0.0',
      source: 'file',
      local: true,
    },
  }, 'external', undefined, 1)
  const target = createEnvironmentSnapshot({
    'koishi-plugin-local': {
      request: 'file:F:/plugins/local-old',
      resolved: '0.9.0',
      source: 'file',
      local: true,
    },
  }, 'operation', undefined, 2)

  const diff = getEnvironmentDiff(current, target)
  assert.equal(diff[0].status, 'unsupported')
  assert.equal(diff[0].reason, 'local')
  assert.deepEqual(getEnvironmentInstallChanges(diff, target), {})
})

test('uses the local request in environment identity', () => {
  const left = createEnvironmentSnapshot({
    local: {
      request: 'file:F:/plugins/left',
      resolved: '1.0.0',
      source: 'file',
      local: true,
    },
  }, 'external', undefined, 1)
  const right = createEnvironmentSnapshot({
    local: {
      request: 'file:F:/plugins/right',
      resolved: '1.0.0',
      source: 'file',
      local: true,
    },
  }, 'external', undefined, 1)

  assert.notEqual(left.id, right.id)
})

test('migrates legacy file snapshots to local semantics', () => {
  const current = createEnvironmentSnapshot({
    local: { request: 'file:.yarn/local/example.tgz', resolved: '1.0.0' },
  }, 'external', undefined, 1)
  const target = createEnvironmentSnapshot({
    local: { request: '1.0.0', resolved: '1.0.0' },
  }, 'operation', undefined, 2)

  assert.equal(current.dependencies.local.local, true)
  assert.equal(current.dependencies.local.source, 'file')
  assert.equal(getEnvironmentDiff(current, target)[0].status, 'unsupported')
})

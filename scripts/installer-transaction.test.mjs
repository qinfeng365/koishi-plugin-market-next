import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasDependencyRuntimeChange,
  requiresPackageManager,
} from '../src/node/installer-transaction.ts'

function requirement(overrides = {}) {
  return {
    changes: { example: '^1.0.0' },
    currentDependencies: { example: '^1.0.0' },
    currentLocalDeps: { example: { request: '1.0.0', resolved: '1.2.0', source: 'registry', local: false } },
    nextLocalDeps: { example: { request: '^1.0.0', resolved: '1.2.0', source: 'registry', local: false } },
    ...overrides,
  }
}

test('skips the package manager when the installed registry version satisfies the request', () => {
  assert.equal(requiresPackageManager(requirement()), false)
})

test('requires the package manager for forced operations, removals, and unsatisfied versions', () => {
  assert.equal(requiresPackageManager(requirement({ forced: true })), true)
  assert.equal(requiresPackageManager(requirement({ changes: { example: '' } })), true)
  assert.equal(requiresPackageManager(requirement({
    changes: { example: '^2.0.0' },
    nextLocalDeps: { example: { request: '^2.0.0', resolved: '1.2.0', source: 'registry', local: false } },
  })), true)
})

test('requires the package manager when a dependency changes between registry and local sources', () => {
  assert.equal(requiresPackageManager(requirement({
    changes: { example: 'file:.yarn/local/example.tgz' },
    nextLocalDeps: { example: { request: 'file:.yarn/local/example.tgz', resolved: '1.2.0', source: 'file', local: true, bound: true } },
  })), true)
})

test('keeps an unchanged local dependency outside the package-manager workflow', () => {
  const local = { request: 'file:.yarn/local/example.tgz', resolved: '1.2.0', source: 'file', local: true, bound: true }
  assert.equal(requiresPackageManager(requirement({
    changes: { example: local.request },
    currentDependencies: { example: local.request },
    currentLocalDeps: { example: local },
    nextLocalDeps: { example: local },
  })), false)
})

function runtimeChange(overrides = {}) {
  return {
    name: 'example',
    changes: { example: '^1.0.0' },
    previousDependencies: { example: '^1.0.0' },
    previousLocalDeps: { example: { request: '^1.0.0', resolved: '1.2.0', source: 'registry', local: false } },
    nextLocalDeps: { example: { request: '^1.0.0', resolved: '1.2.0', source: 'registry', local: false } },
    ...overrides,
  }
}

test('detects installed version changes and ignores removed dependencies', () => {
  assert.equal(hasDependencyRuntimeChange(runtimeChange({
    nextLocalDeps: { example: { request: '^2.0.0', resolved: '2.0.0', source: 'registry', local: false } },
  })), true)
  assert.equal(hasDependencyRuntimeChange(runtimeChange({ nextLocalDeps: {} })), false)
})

test('reloads for a changed local request even when the resolved version is unchanged', () => {
  assert.equal(hasDependencyRuntimeChange(runtimeChange({
    changes: { example: 'file:.yarn/local/example-next.tgz' },
    nextLocalDeps: { example: { request: 'file:.yarn/local/example-next.tgz', resolved: '1.2.0', source: 'file', local: true, bound: true } },
  })), true)
})

test('does not reload for a registry range change satisfied by the same installed version', () => {
  assert.equal(hasDependencyRuntimeChange(runtimeChange({
    changes: { example: '^1.2.0' },
    nextLocalDeps: { example: { request: '^1.2.0', resolved: '1.2.0', source: 'registry', local: false } },
  })), false)
})

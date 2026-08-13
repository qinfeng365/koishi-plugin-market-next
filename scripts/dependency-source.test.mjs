import assert from 'node:assert/strict'
import test from 'node:test'

import {
  allRegistryAttemptsNotFound,
  classifyRegistryNotFoundDependency,
  classifyDependencySource,
  findDependenciesNeedingSourceCheck,
  findUnboundLocalDependencies,
  getRegistryAttemptReasons,
  isLocalDependency,
  reuseConfirmedDependencySource,
  shouldPenalizeRegistryRoute,
  shouldIncludeDiscoveredLocalPlugin,
} from '../src/shared/dependency-source.ts'
import {
  createHashedLocalBindingFilename,
  createLocalBindingRequest,
  parseNpmPackOutput,
} from '../src/node/local-binding.ts'

test('classifies explicit local dependency protocols', () => {
  assert.deepEqual(classifyDependencySource('file:.yarn/local/example.tgz'), {
    source: 'file',
    local: true,
    bound: true,
  })
  assert.deepEqual(classifyDependencySource('workspace:*'), {
    source: 'workspace',
    local: true,
    bound: true,
  })
  assert.deepEqual(classifyDependencySource('link:../example'), {
    source: 'link',
    local: true,
    bound: true,
  })
  assert.deepEqual(classifyDependencySource('portal:../example'), {
    source: 'portal',
    local: true,
    bound: true,
  })
})

test('classifies path requests and resolved workspaces as local', () => {
  assert.equal(classifyDependencySource('../example').source, 'file')
  assert.equal(classifyDependencySource('C:\\plugins\\example').source, 'file')
  assert.equal(classifyDependencySource('0.1.0', { workspace: true }).source, 'workspace')
  assert.deepEqual(classifyDependencySource('latest', {
    installed: true,
    discoveredLocal: true,
  }), {
    source: 'unbound',
    local: true,
    bound: false,
  })
})

test('keeps normal registry, git, and URL requests outside the local category', () => {
  assert.deepEqual(classifyDependencySource('^1.2.3'), {
    source: 'registry',
    local: false,
    bound: true,
  })
  assert.equal(classifyDependencySource('github:user/repository').local, false)
  assert.equal(classifyDependencySource('https://example.com/plugin.tgz').local, false)
  assert.equal(classifyDependencySource('github:user/repository', {
    installed: true,
    discoveredLocal: true,
  }).local, false)
})

test('recognizes every local dependency source through one compatibility check', () => {
  assert.equal(isLocalDependency({ local: true }), true)
  assert.equal(isLocalDependency({ workspace: true }), true)
  assert.equal(isLocalDependency({ source: 'file' }), true)
  assert.equal(isLocalDependency({ source: 'registry' }), false)
  assert.equal(isLocalDependency(undefined), false)
})

test('includes configured or running undeclared plugins in the local group', () => {
  assert.equal(shouldIncludeDiscoveredLocalPlugin({ declared: true, configured: true }), false)
  assert.equal(shouldIncludeDiscoveredLocalPlugin({ declared: false, configured: true }), true)
  assert.equal(shouldIncludeDiscoveredLocalPlugin({ declared: false, running: true }), true)
  assert.equal(shouldIncludeDiscoveredLocalPlugin({ declared: false, workspace: true }), true)
  assert.equal(shouldIncludeDiscoveredLocalPlugin({ declared: false }), false)
})

test('marks an installed registry dependency as unbound after metadata not-found', () => {
  assert.deepEqual(classifyDependencySource('0.1.0', {
    installed: true,
    registryNotFound: true,
  }), {
    source: 'unbound',
    local: true,
    bound: false,
  })
})

test('requires every attempted registry route to return not-found before local classification', () => {
  assert.equal(allRegistryAttemptsNotFound(['not-found', 'not-found']), true)
  assert.equal(allRegistryAttemptsNotFound(['not-found', 'network']), false)
  assert.equal(allRegistryAttemptsNotFound([]), false)
})

test('classifies an installed Koishi plugin immediately after a definitive registry not-found', () => {
  assert.deepEqual(classifyRegistryNotFoundDependency({
    request: '0.1.0',
    resolved: '0.1.0',
    source: 'registry',
    local: false,
  }, true), {
    source: 'unbound',
    local: true,
    bound: false,
  })
  assert.equal(classifyRegistryNotFoundDependency({
    request: '0.1.0',
    source: 'registry',
    local: false,
  }, true), undefined)
  assert.equal(classifyRegistryNotFoundDependency({
    request: '0.1.0',
    resolved: '0.1.0',
    source: 'registry',
    local: false,
  }, false), undefined)
})

test('reuses a fresh unbound classification only for the same installed dependency', () => {
  const previous = {
    request: '0.1.0',
    resolved: '0.1.0',
    source: 'unbound',
    local: true,
  }
  assert.deepEqual(reuseConfirmedDependencySource(previous, {
    request: '0.1.0',
    resolved: '0.1.0',
    source: 'registry',
  }, true), {
    source: 'unbound',
    local: true,
    bound: false,
  })
  assert.equal(reuseConfirmedDependencySource(previous, {
    request: '0.2.0',
    resolved: '0.1.0',
    source: 'registry',
  }, true), undefined)
  assert.equal(reuseConfirmedDependencySource(previous, {
    request: '0.1.0',
    resolved: '0.1.0',
    source: 'registry',
  }, false), undefined)
})

test('preserves every endpoint failure reason from a routed registry attempt', () => {
  assert.deepEqual(getRegistryAttemptReasons({
    marketNextReasons: ['not-found', 'network', 'not-found'],
  }, 'unknown'), ['not-found', 'network', 'not-found'])
  assert.deepEqual(getRegistryAttemptReasons({}, 'timeout'), ['timeout'])
})

test('does not penalize a registry route when only the requested package is missing', () => {
  assert.equal(shouldPenalizeRegistryRoute('not-found'), false)
  assert.equal(shouldPenalizeRegistryRoute('timeout'), true)
  assert.equal(shouldPenalizeRegistryRoute('network'), true)
  assert.equal(shouldPenalizeRegistryRoute('invalid'), true)
})

test('blocks unrelated package-manager operations when an unbound local dependency remains', () => {
  const dependencies = {
    'koishi-plugin-miyako-gallery': { source: 'unbound', local: true },
    'koishi-plugin-market-next': { source: 'file', local: true },
  }
  assert.deepEqual(
    findUnboundLocalDependencies(dependencies, { 'koishi-plugin-market-next': '3.6.3' }),
    ['koishi-plugin-miyako-gallery'],
  )
})

test('allows an operation that explicitly removes or migrates the unbound dependency', () => {
  const dependencies = {
    'koishi-plugin-miyako-gallery': { source: 'unbound', local: true },
  }
  assert.deepEqual(findUnboundLocalDependencies(dependencies, {
    'koishi-plugin-miyako-gallery': '',
  }), [])
  assert.deepEqual(findUnboundLocalDependencies(dependencies, {
    'koishi-plugin-miyako-gallery': 'file:.yarn/local/koishi-plugin-miyako-gallery-0.1.0.tgz',
  }), [])
})

test('checks only installed registry plugins without a completed metadata result', () => {
  const dependencies = {
    'koishi-plugin-private': {
      request: '0.1.0',
      resolved: '0.1.0',
      source: 'registry',
      local: false,
    },
    'koishi-plugin-public': {
      request: '1.0.0',
      resolved: '1.0.0',
      source: 'registry',
      local: false,
    },
  }
  assert.deepEqual(findDependenciesNeedingSourceCheck(dependencies, {
    'koishi-plugin-public': '1.1.0',
  }, ['koishi-plugin-public']), ['koishi-plugin-private'])
  assert.deepEqual(findDependenciesNeedingSourceCheck(dependencies, {
    'koishi-plugin-private': '',
    'koishi-plugin-public': '1.1.0',
  }, []), [])
  assert.deepEqual(findDependenciesNeedingSourceCheck(dependencies, {
    'koishi-plugin-public': '1.1.0',
  }, ['koishi-plugin-private', 'koishi-plugin-public']), [])
})

test('keeps a cached not-found package in preflight until it is classified as local', () => {
  const dependencies = {
    'koishi-plugin-private': {
      request: '0.1.0',
      resolved: '0.1.0',
      source: 'registry',
      local: false,
    },
  }
  // A negative cache suppresses the network request, but is not a completed
  // registry payload and must still pass through local-source classification.
  assert.deepEqual(findDependenciesNeedingSourceCheck(dependencies, {}, []), [
    'koishi-plugin-private',
  ])
})

test('parses a safe npm pack result and creates a portable local request', () => {
  const result = parseNpmPackOutput(JSON.stringify([{
    name: 'koishi-plugin-example',
    version: '0.1.0',
    filename: 'koishi-plugin-example-0.1.0.tgz',
    size: 1024,
  }]))
  assert.deepEqual(result, {
    name: 'koishi-plugin-example',
    version: '0.1.0',
    filename: 'koishi-plugin-example-0.1.0.tgz',
    size: 1024,
  })
  assert.equal(
    createLocalBindingRequest(result.filename),
    'file:.yarn/local/koishi-plugin-example-0.1.0.tgz',
  )
  assert.equal(
    createHashedLocalBindingFilename(result.filename, '2d711642b726'),
    'koishi-plugin-example-0.1.0-2d711642b726.tgz',
  )
})

test('rejects unsafe or invalid npm pack output', () => {
  assert.throws(() => parseNpmPackOutput('not-json'), /invalid npm pack output/i)
  assert.throws(() => parseNpmPackOutput('[{"filename":"../escape.tgz","size":1}]'), /invalid npm pack filename/i)
  assert.throws(() => parseNpmPackOutput('[{"filename":"example.zip","size":1}]'), /invalid npm pack filename/i)
  assert.throws(() => parseNpmPackOutput('[{"filename":"example.tgz","size":0}]'), /invalid npm pack size/i)
  assert.throws(() => createLocalBindingRequest('../escape.tgz'), /invalid npm pack filename/i)
  assert.throws(() => createHashedLocalBindingFilename('example.tgz', '../bad'), /invalid npm pack hash/i)
})

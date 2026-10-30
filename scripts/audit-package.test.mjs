import assert from 'node:assert/strict'
import test from 'node:test'
import { getRuntimePackages, getRuntimeVulnerabilities } from './audit-package.mjs'

test('follows runtime edges without treating host peers or build tools as runtime dependencies', () => {
  const paths = getRuntimePackages({ packages: {
    '': { dependencies: { runtime: '*' }, devDependencies: { build: '*' }, peerDependencies: { host: '*' } },
    'node_modules/runtime': { dependencies: { shared: '*' }, optionalDependencies: { extra: '*', absent: '*' }, peerDependencies: { host: '*' } },
    'node_modules/shared': {},
    'node_modules/extra': {},
    'node_modules/build': { dependencies: { shared: '*', tool: '*' } },
    'node_modules/tool': {},
    'node_modules/host': { dependencies: { tool: '*' } },
  } })
  assert.deepEqual([...paths].sort(), ['node_modules/extra', 'node_modules/runtime', 'node_modules/shared'])
})

test('resolves nested and scoped dependencies before hoisted versions', () => {
  const paths = getRuntimePackages({ packages: {
    '': { dependencies: { '@scope/runtime': '*' }, devDependencies: { shared: '*' } },
    'node_modules/@scope/runtime': { dependencies: { shared: '*' } },
    'node_modules/@scope/runtime/node_modules/shared': { dependencies: { '@scope/leaf': '*' } },
    'node_modules/@scope/leaf': {},
    'node_modules/shared': {},
  } })
  assert(paths.has('node_modules/@scope/runtime/node_modules/shared'))
  assert(paths.has('node_modules/@scope/leaf'))
  assert(!paths.has('node_modules/shared'))
})

test('runtime reachability wins even when lock metadata marks a package as development-only', () => {
  const paths = getRuntimePackages({ packages: {
    '': { dependencies: { shared: '*' } },
    'node_modules/shared': { version: '1.0.0', dev: true, peer: true },
  } })
  const issues = getRuntimeVulnerabilities({ vulnerabilities: {
    shared: { name: 'shared', nodes: ['node_modules/shared'], via: [{ range: '<2', severity: 'high' }] },
    tool: { name: 'tool', nodes: ['node_modules/tool'], via: [{ range: '*', severity: 'critical' }] },
  } }, paths, { 'node_modules/shared': { version: '1.0.0' } })
  assert.deepEqual(issues.map(item => item.name), ['shared'])
})

test('matches advisory paths rather than hiding every installation of the same package name', () => {
  const issues = getRuntimeVulnerabilities({ vulnerabilities: {
    shared: { name: 'shared', nodes: ['node_modules/build/node_modules/shared'], via: [{ range: '*', severity: 'high' }] },
  } }, new Set(['node_modules/shared']), {})
  assert.equal(issues.length, 0)
})

test('does not inherit host peer severity or match a fixed runtime version to a vulnerable development version', () => {
  const issues = getRuntimeVulnerabilities({ vulnerabilities: {
    runtime: { name: 'runtime', nodes: ['node_modules/runtime'], severity: 'critical', via: ['host'] },
    shared: {
      name: 'shared',
      nodes: ['node_modules/shared', 'node_modules/build/node_modules/shared'],
      via: [{ range: '<2', severity: 'high' }],
    },
  } }, new Set(['node_modules/runtime', 'node_modules/shared']), {
    'node_modules/runtime': { version: '1.0.0' },
    'node_modules/shared': { version: '2.0.0' },
    'node_modules/build/node_modules/shared': { version: '1.0.0' },
  })
  assert.equal(issues.length, 0)
})

test('fails closed when a required runtime dependency is missing from the lockfile', () => {
  assert.throws(() => getRuntimePackages({ packages: {
    '': { dependencies: { missing: '*' } },
  } }), /Missing runtime dependency/)
})

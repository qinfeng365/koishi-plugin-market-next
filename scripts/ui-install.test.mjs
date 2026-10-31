import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const vue = require('vue')

function load(name, mocks) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../client/composables/use-${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports, console,
    require(name) {
      if (name === 'vue') return vue
      assert.ok(Object.hasOwn(mocks, name), name)
      return mocks[name]
    },
  })
  return module.exports
}

function createInstall() {
  const active = vue.ref('')
  const store = vue.reactive({ registry: {}, dependencies: {}, packages: {} })
  const override = {}
  const analyses = vue.reactive({})
  const requests = []
  const module = load('install', {
    '@koishijs/client': {
      store, useContext: () => ({}), useConfig: () => vue.ref({}),
      send(event, names) {
        assert.equal(event, 'market/registry')
        return new Promise(resolve => requests.push({ names, resolve }))
      },
    },
    '../components/utils': { analyzeVersions: name => analyses[name], getRegistryStatus() {} },
    '../utils': { active, getBulkMode: () => false, getPendingOverrides: () => override },
    semver: require('semver'),
    '../../src/shared/bundle': {},
    '../../src/shared/dependency-source': { isLocalDependency: () => false },
    '../i18n': { useMarketNextI18n: () => ({ t: key => key }) },
    '../market/state': {},
  })
  const scope = vue.effectScope()
  const view = scope.run(() => module.useInstall())
  return { active, store, override, analyses, requests, view, scope }
}

test('a late registry reply cannot replace another package selection', async () => {
  const state = createInstall()
  try {
    state.active.value = 'a'
    await vue.nextTick()
    state.store.registry.b = { '2.0.0': {}, '1.0.0': {} }
    state.override.b = '1.0.0'
    state.active.value = 'b'
    await vue.nextTick()
    state.requests[0].resolve({ a: { '3.0.0': {} } })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(state.view.version.value, '1.0.0')
    assert.equal(state.view.getVersion('a'), undefined)
  } finally { state.scope.stop() }
})

test('switching away and back invalidates the first request for the same package', async () => {
  const state = createInstall()
  try {
    state.active.value = 'a'
    await vue.nextTick()
    state.active.value = 'b'
    await vue.nextTick()
    state.active.value = 'a'
    await vue.nextTick()
    state.requests[2].resolve({ a: { '2.0.0': {} } })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(state.view.version.value, '2.0.0')
    state.requests[0].resolve({ a: { '1.0.0': {} } })
    state.requests[1].resolve({ b: { '3.0.0': {} } })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(state.view.version.value, '2.0.0')
  } finally { state.scope.stop() }
})

test('registry replies preserve a version chosen while loading and are ignored after unmount', async () => {
  const state = createInstall()
  try {
    state.active.value = 'a'
    await vue.nextTick()
    state.view.selectVersion.value = '1.0.0'
    state.requests[0].resolve({ a: { '2.0.0': {} } })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(state.view.version.value, '1.0.0')
    state.active.value = 'b'
    await vue.nextTick()
    state.scope.stop()
    state.requests[1].resolve({ b: { '3.0.0': {} } })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(state.view.version.value, undefined)
  } finally { state.scope.stop() }
})

for (const change of ['package', 'version', 'unmount']) {
  test(`a late peer registry reply is ignored after changing ${change}`, async () => {
    const state = createInstall()
    const peers = { peer: { result: 'danger' } }
    try {
      state.store.registry.a = { '1.0.0': {}, '2.0.0': {} }
      state.store.registry.b = { '1.0.0': {} }
      state.analyses.a = { '1.0.0': { peers } }
      state.active.value = 'a'
      await vue.nextTick()
      if (change === 'package') state.active.value = 'b'
      if (change === 'version') state.view.selectVersion.value = '2.0.0'
      if (change === 'unmount') state.scope.stop()
      await vue.nextTick()
      state.requests[0].resolve({ peer: { '3.0.0': {} } })
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(state.view.getVersion('peer'), undefined)
    } finally { state.scope.stop() }
  })
}

test('the current peer request still supplies an incompatible dependency version', async () => {
  const state = createInstall()
  try {
    state.store.registry.a = { '1.0.0': {} }
    state.analyses.a = { '1.0.0': { peers: { peer: { result: 'danger' } } } }
    state.active.value = 'a'
    await vue.nextTick()
    state.requests[0].resolve({ peer: { '3.0.0': {} } })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(state.view.getVersion('peer'), '3.0.0')
  } finally { state.scope.stop() }
})

test('confirmation resets cleanup choices on each opening and captures them for an installation', async () => {
  const showConfirm = vue.ref(false)
  let saved
  let callback
  const removed = []
  const module = load('confirm', {
    '@koishijs/client': { useContext: () => ({}), useConfig: () => vue.ref({}) },
    '../i18n': { useMarketNextI18n: () => ({ t: key => key }) },
    '../utils': {
      getPendingOverrides: () => ({ example: '' }), getRemoveConfig: () => saved,
      getWritableBundleRecords: () => ({}), patchMarketNextData: async () => true,
    },
    '../components/utils': {
      showConfirm, pendingBundleUninstalls: vue.ref({}), MARKET_NEXT_PACKAGE: 'koishi-plugin-market-next',
      install(_, fn) { callback = fn }, ensureInstalledConfigs: async () => {},
      getConfigWriter: () => ({ remove: name => removed.push(name) }),
    },
  })
  const scope = vue.effectScope()
  const view = scope.run(() => module.useConfirm())
  try {
    saved = false
    showConfirm.value = true
    assert.equal(view.removeConfig.value, false)
    view.removeConfig.value = true
    showConfirm.value = false
    showConfirm.value = true
    assert.equal(view.removeConfig.value, false)
    showConfirm.value = false
    saved = true
    showConfirm.value = true
    view.confirm()
    saved = false
    showConfirm.value = true
    assert.equal(view.removeConfig.value, false)
    await callback()
    assert.deepEqual(removed, ['example'])
    showConfirm.value = false
    saved = undefined
    showConfirm.value = true
    assert.equal(view.removeConfig.value, undefined)
  } finally { scope.stop() }
})

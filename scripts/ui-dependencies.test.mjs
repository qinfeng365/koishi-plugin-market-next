import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const vue = require('vue')
const { compileScript, parse } = require('@vue/compiler-sfc')
const code = ts.transpileModule(readFileSync(new URL('../client/composables/use-dependencies.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function createState(fetch) {
  const store = vue.reactive({ market: { registry: 'https://registry.npmjs.org' }, packages: {}, dependencies: {} })
  const override = vue.reactive({})
  const versions = {}
  const calls = []
  const errors = []
  const mocks = {
    vue: { ...vue, onMounted() {}, onBeforeUnmount() {} },
    '@koishijs/client': { store, useConfig: () => vue.ref({ market: {} }), useContext: () => ({}) },
    '../i18n': { useMarketNextI18n: () => ({ t: key => key }) },
    '../utils': { getPendingOverrides: () => override },
    '../components/utils': {
      findBundleRecord() {},
      getConfigWriter() {},
      getVersions: name => versions[name],
      async addManual(name) {
        calls.push(name)
        versions[name] = await fetch(name)
      },
    },
    '../../src/shared/bundle': { PLUGIN_PACKAGE_RE: /^koishi-plugin-/ },
    '../../src/shared/dependency-source': {},
    '../market/state': { loadMarketObjects: async () => {} },
    '../registry-state': {},
  }
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports,
    console: { error: (...args) => errors.push(args) },
    require(name) {
      assert.ok(Object.hasOwn(mocks, name), name)
      return mocks[name]
    },
  })
  const scope = vue.effectScope()
  scope.run(() => module.exports.useDependencies())
  return { store, override, calls, errors, scope }
}

test('pending dependencies deduplicate in-flight and already loaded metadata', async () => {
  let done
  const state = createState(() => new Promise(resolve => { done = resolve }))
  try {
    state.override.example = '1.0.0'
    await vue.nextTick()
    state.override.example = '1.1.0'
    await vue.nextTick()
    assert.deepEqual(state.calls, ['example'])
    done({ '1.1.0': {} })
    await new Promise(resolve => setImmediate(resolve))
    state.override.example = '1.2.0'
    await vue.nextTick()
    assert.deepEqual(state.calls, ['example'])
    assert.deepEqual(state.errors, [])
  } finally {
    state.scope.stop()
  }
})

test('failed pending metadata is caught and can be retried after another edit', async () => {
  const state = createState(async () => { throw new Error('registry unavailable') })
  try {
    state.override.example = '1.0.0'
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(state.errors.length, 1)
    assert.equal(state.errors[0][1], 'example')
    state.override.example = '1.1.0'
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(state.calls, ['example', 'example'])
    assert.equal(state.errors.length, 2)
  } finally {
    state.scope.stop()
  }
})

for (const native of [false, true]) {
  test(`installation log auto-scroll uses the ${native ? 'original native viewport' : 'standard scrollbar'}`, async () => {
    const module = { exports: {} }
    const state = vue.reactive({ logs: [], status: 'running' })
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../client/composables/use-install-progress.ts', import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText, {
      module, exports: module.exports,
      require(name) {
        if (name === 'vue') return vue
        if (name === '../i18n') return { useMarketNextI18n: () => ({ t: key => key }) }
        if (name === '../components/utils') return { installProgressState: state }
        throw new Error(name)
      },
    })
    const scope = vue.effectScope()
    const view = scope.run(() => module.exports.useInstallProgress(native))
    try {
      let scrolled
      view.viewport.value = native ? { scrollTop: 0, scrollHeight: 450 }
        : { wrapRef: { scrollHeight: 450 }, setScrollTop: value => { scrolled = value } }
      state.logs.push({ line: 'install', type: 'stdout' })
      await vue.nextTick()
      await vue.nextTick()
      assert.equal(native ? view.viewport.value.scrollTop : scrolled, 450)
      let closed = false
      view.handleBeforeClose(() => { closed = true })
      assert.equal(closed, false)
      state.status = 'success'
      view.handleBeforeClose(() => { closed = true })
      assert.equal(closed, true)
    } finally { scope.stop() }
  })
}

for (const listMode of [false, true]) {
  test(`VE ${listMode ? 'list' : 'card'} buttons dispatch the shared dependency commands`, async () => {
    const file = new URL('../client/variants/ve/package.vue', import.meta.url)
    const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: fileURLToPath(file) })
    const module = { exports: {} }
    const calls = []
    const errors = []
    const editing = vue.ref(false)
    vm.runInNewContext(ts.transpileModule(compileScript(descriptor, {
      id: 've-package', inlineTemplate: true,
      fs: { fileExists: ts.sys.fileExists, readFile: ts.sys.readFile },
    }).content, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      module, exports: module.exports,
      require(name) {
        if (name === 'vue') return vue
        if (name === '../../composables/use-dependency') return {
          useDependency: () => ({
            t: key => key,
            editing,
            menuItems: vue.ref(['history', 'ignore', 'remove', 'version'].map(command => ({ command }))),
            onCommand(command) {
              calls.push(command)
              if (command === 'version') editing.value = !editing.value
            },
          }),
        }
        if (name === '../../market/icons' || name === '../../components/version-picker.vue') {
          return { default: { render: () => null } }
        }
        throw new Error(name)
      },
    })
    const renderer = vue.createRenderer({
      createElement: tag => ({ tag, children: [], props: {} }),
      createText: text => ({ text }),
      createComment: text => ({ text }),
      insert(node, parent, anchor) {
        node.parent = parent
        const index = anchor ? parent.children.indexOf(anchor) : -1
        parent.children.splice(index < 0 ? parent.children.length : index, 0, node)
      },
      remove(node) { node.parent.children.splice(node.parent.children.indexOf(node), 1) },
      setText(node, text) { node.text = text },
      setElementText(node, text) { node.text = text },
      parentNode: node => node.parent,
      nextSibling: node => node.parent.children[node.parent.children.indexOf(node) + 1],
      patchProp(node, key, previous, next) { node.props[key] = next },
    })
    const root = { children: [] }
    const app = renderer.createApp(module.exports.default, { name: 'koishi-plugin-example', listMode })
    app.component('ElButton', {
      setup: (_, { attrs, slots }) => () => vue.h('button', attrs, slots.default?.()),
    })
    app.config.errorHandler = err => errors.push(err)
    app.config.warnHandler = () => {}
    try {
      app.mount(root)
      const buttons = []
      function visit(node) {
        if (node.tag === 'button') buttons.push(node)
        for (const child of node.children ?? []) visit(child)
      }
      visit(root)
      assert.equal(buttons.length, 4)
      for (const button of buttons) button.props.onClick()
      await vue.nextTick()
      assert.deepEqual(errors, [])
      assert.deepEqual(calls, ['history', 'ignore', 'remove', 'version'])
      assert.equal(editing.value, true)
    } finally {
      app.unmount()
    }
  })
}

function createActions(activity, coupleRefresh, send = () => Promise.resolve()) {
  const calls = []
  const messages = []
  const menus = {}
  const actions = {}
  const route = vue.ref({ meta: { activity: { id: activity } } })
  const dialogs = {
    activeBundle: vue.ref({}), showConfirm: vue.ref(true), dependencyDialog: { type: 'ignore' },
    installProgressState: { visible: false },
    getConfigWriter: () => undefined,
    getRegistryStatus: () => undefined,
    findBundleRecord: () => undefined,
  }
  const store = vue.reactive({ market: {}, dependencies: {}, packages: {} })
  const override = vue.reactive({})
  const utils = {
    getMarketNextConfig: () => ({ coupleRefresh }),
    getMarketNextPolicy: () => ({}),
    getPendingOverrides: () => override,
    hasUpdate: () => false,
    patchMarketNextData: async patch => calls.push(patch),
  }
  const mocks = {
    vue,
    '@koishijs/client': {
      router: { currentRoute: route },
      store,
      send(event) { calls.push(event); return send(event) },
      message: {
        success: key => messages.push(['success', key]),
        error: key => messages.push(['error', key]),
      },
    },
    './utils': utils,
    '../src/shared/bundle': { getPluginShortname: name => name.replace('koishi-plugin-', ''), PLUGIN_PACKAGE_RE: /^koishi-plugin-/ },
    './i18n': { translate: key => key },
    './components/utils': dialogs,
    './registry-state': { isRegistryRefreshing: () => false },
  }
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../client/actions.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports,
    console: { error() {} }, setTimeout() {},
    require(name) {
      assert.ok(Object.hasOwn(mocks, name), name)
      return mocks[name]
    },
  })
  module.exports.setupActions({
    action(name, action) { actions[name] = action },
    menu(name, items) { menus[name] = items },
    effect() {},
  })
  return { calls, messages, menus, route, dialogs, store, override, utils, actions, refresh: actions['market.refresh'].action }
}

for (const activity of ['market', 'dependencies']) {
  for (const coupled of [undefined, false, true]) {
    test(`${activity} refresh ${coupled ? 'also refreshes the other page' : 'stays independent'} with coupling=${coupled}`, async () => {
      const state = createActions(activity, coupled)
      await state.refresh()
      const deps = activity === 'dependencies' || coupled === true
      assert.deepEqual(state.calls, coupled ? ['market/refresh', 'market/refresh-dependencies']
        : [deps ? 'market/refresh-dependencies' : 'market/refresh'])
      assert.equal(state.dialogs.showConfirm.value, !deps)
      assert.equal(state.dialogs.dependencyDialog.type, deps ? undefined : 'ignore')
      assert.deepEqual(state.messages, [['success', `common.messages.${coupled ? 'refreshBothStarted' : deps ? 'refreshDependenciesStarted' : 'refreshMarketSubmitted'}`]])
    })
  }
}

test('coupled refresh starts both requests at once and blocks duplicate cross-page refreshes', async () => {
  const pending = []
  const state = createActions('market', true, () => new Promise(resolve => pending.push(resolve)))
  const task = state.refresh()
  assert.deepEqual(state.calls, ['market/refresh', 'market/refresh-dependencies'])
  assert.equal(state.menus.market[1].type(), 'spin disabled')
  assert.equal(state.menus.dependencies.at(-1).type(), 'spin disabled')
  state.route.value.meta.activity.id = 'dependencies'
  await state.refresh()
  assert.equal(state.calls.length, 2)
  pending[1]()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.dialogs.showConfirm.value, false)
  pending[0]()
  await task
  assert.equal(state.menus.market[1].type(), '')
  assert.equal(state.menus.dependencies.at(-1).type(), '')
})

for (const event of ['market/refresh', 'market/refresh-dependencies']) {
  test(`a failed ${event} does not prevent the other refresh and releases both buttons`, async () => {
    const state = createActions('market', true, name => name === event ? Promise.reject(new Error('failed')) : Promise.resolve())
    await state.refresh()
    assert.deepEqual(state.calls, ['market/refresh', 'market/refresh-dependencies'])
    assert.equal(state.dialogs.showConfirm.value, event !== 'market/refresh')
    assert.deepEqual(state.messages, [['error', 'common.messages.refreshFailed']])
    assert.equal(state.menus.market[1].type(), '')
    assert.equal(state.menus.dependencies.at(-1).type(), '')
  })
}

test('coupled refresh never reports success while disconnected or closes an active install', async () => {
  const disconnected = createActions('market', true, () => undefined)
  await disconnected.refresh()
  assert.deepEqual(disconnected.messages, [['error', 'common.messages.refreshFailed']])
  assert.equal(disconnected.dialogs.showConfirm.value, true)
  const installing = createActions('market', true)
  installing.dialogs.installProgressState.visible = true
  await installing.refresh()
  assert.equal(installing.dialogs.showConfirm.value, true)
  assert.equal(installing.dialogs.dependencyDialog.type, 'ignore')
})

test('upgrade action is available before mounting a dependency page and preserves exclusions', async () => {
  const state = createActions('market', false)
  state.dialogs.getConfigWriter = () => ({})
  state.dialogs.configuredPlugins = vue.ref(new Set(['example']))
  state.dialogs.findBundleRecord = name => name === 'bundle'
  state.dialogs.getRegistryStatus = name => name === 'failed' ? { error: 'failed' } : undefined
  state.utils.hasUpdate = name => name !== 'ignored'
  state.utils.getLatestVersion = () => '2.0.0'
  Object.assign(state.store.dependencies, {
    'koishi-plugin-example': { resolved: '1.0.0' },
    'koishi-plugin-unconfigured': { resolved: '1.0.0' },
    local: { local: true }, workspace: { workspace: true }, invalid: { invalid: true },
    bundle: {}, pending: {}, failed: {}, ignored: {},
  })
  Object.assign(state.store.packages, { 'koishi-plugin-example': {}, 'koishi-plugin-unconfigured': {} })
  state.override.pending = '1.5.0'
  const action = state.actions['dependencies.upgrade']
  assert.equal(action.disabled(), false)
  await action.action()
  assert.deepEqual({ ...state.override }, { pending: '1.5.0', 'koishi-plugin-example': '2.0.0' })
  assert.equal(action.disabled(), true)
  assert.equal(state.calls.length, 1)
  assert.deepEqual({ ...state.calls[0].override }, { ...state.override })
})

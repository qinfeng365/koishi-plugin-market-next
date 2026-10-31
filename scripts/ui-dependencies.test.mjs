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
    '@koishijs/client': { store, useConfig: () => vue.ref({ market: {} }), useContext: () => ({ action() {} }) },
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

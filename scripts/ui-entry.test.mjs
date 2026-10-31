import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')

function loadEntry(kind, base, tree = 'lib') {
  const filename = resolve(root, 'src', kind, 'index.ts')
  const dir = resolve(root, tree, kind)
  const source = readFileSync(filename, 'utf8').replace('import.meta.url', JSON.stringify(pathToFileURL(resolve(dir, 'index.mjs')).href))
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  class Stub {}
  const noop = () => {}
  const mocks = {
    koishi: { Schema: { object: () => ({ i18n: () => ({}) }), union: () => ({ role: () => ({ default: () => ({}) }) }), const: noop } },
    './logger': { logger: { info: noop, warn: noop }, setLogLevel: noop },
    './deps': { DependencyProvider: Stub, PluginConfigProvider: Stub, RegistryProvider: Stub, RegistryStatusProvider: Stub },
    './data': { MarketDataStore: Stub },
    './installer': Stub,
    './market': Stub,
    './chatluna': { applyChatLunaTool: noop },
    './commands': { setupCommands: noop },
    './idle-probe': { setupIdleProbe: noop },
    './console-listeners': { setupConsoleListeners: noop },
    './plugin-config': { ensureInstalledPluginConfigs: noop },
    './avatar': { startAvatarCacheMaintenance: noop },
    './config': { Config: {}, ensureMarketNextConfigDefaults: () => false, removeMigratedConfigKeys: noop },
    './market-snapshot': { MarketSnapshotTransport: Stub },
    '../shared': {},
  }
  vm.runInNewContext(code, {
    module, exports: module.exports, __dirname: dir,
    process: { env: { KOISHI_BASE: base } },
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      if (name.startsWith('./locales/')) return {}
      return require(name)
    },
  }, { filename })
  return module.exports
}

for (const ui of ['standard', 've']) {
  test(`node ${ui} registers only its own dev and production entry`, () => {
    const entries = []
    const ctx = {
      loader: { writable: true },
      plugin() {},
      inject(_, callback) { callback(ctx) },
      effect(callback) { callback() },
      on() {},
      server: { get() {} },
      console: { addEntry(entry) { entries.push(entry) } },
    }
    loadEntry('node').apply(ctx, { uiVariant: ui })
    assert.equal(entries.length, 1)
    assert.equal(entries[0].prod, resolve(root, 'dist', ui))
    assert.equal(entries[0].dev, resolve(root, 'client', ui === 've' ? 'variants/ve/index.ts' : 'index.ts'))
  })

  test(`browser ${ui} uses matching published assets`, () => {
    const entries = []
    const ctx = { plugin() {}, console: { addListener() {}, addEntry(entry) { entries.push(Array.from(entry)) } } }
    loadEntry('browser', '/plugins/market-next').apply(ctx, { uiVariant: ui })
    assert.deepEqual(entries, [[`/plugins/market-next/dist/${ui}/index.js`, `/plugins/market-next/dist/${ui}/style.css`]])
  })

  test(`browser ${ui} source entry works from src and compiled lib locations`, () => {
    for (const tree of ['src', 'lib']) {
      const entries = []
      const ctx = { plugin() {}, console: { addListener() {}, addEntry(entry) { entries.push(Array.from(entry)) } } }
      loadEntry('browser', undefined, tree).apply(ctx, { uiVariant: ui })
      assert.deepEqual(entries, [[pathToFileURL(resolve(root, 'client', ui === 've' ? 'variants/ve/index.ts' : 'index.ts')).href]])
    }
  })
}

test('VE entry replaces only the selected global dialogs and standard keeps its defaults', () => {
  const source = readFileSync(resolve(root, 'client/pages.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  for (const ve of [false, true]) {
    const slots = []
    const components = {}
    const ctx = { slot(slot) { slots.push(slot) }, page() {} }
    const module = { exports: {} }
    const views = { Market: {}, Dependencies: {} }
    if (ve) Object.assign(views, { Install: {}, Confirm: {}, InstallProgress: {} })
    vm.runInNewContext(code, {
      module, exports: module.exports, console,
      require(name) {
        if (name === 'vue') return { defineComponent: fn => fn }
        if (name === '@koishijs/client') return { global: { static: true } }
        if (name === './i18n') return {}
        if (name === './extensions') return { default() {} }
        if (name === './components/page-boundary') return { createPageBoundary: (_, view) => view }
        if (name.endsWith('.vue')) return { default: components[name] ||= {} }
        throw new Error(name)
      },
    })
    module.exports.setupPages(ctx, views)
    const global = slots.filter(slot => slot.type === 'global')
    assert.equal(global.length, 6)
    for (const [index, key, path] of [
      [0, 'Install', './components/install.vue'],
      [2, 'Confirm', './components/confirm.vue'],
      [3, 'InstallProgress', './components/install-progress.vue'],
    ]) assert.equal(global[index].component, ve ? views[key] : components[path])
    assert.equal(global[1].component, components['./components/bundle-install.vue'])
  }
})

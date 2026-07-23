import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const typescript = require('typescript')
const { createI18n } = require('vue-i18n')
const root = resolve(import.meta.dirname, '..')
const source = readFileSync(resolve(root, 'client', 'i18n-runtime.ts'), 'utf8')
const output = typescript.transpileModule(source, {
  compilerOptions: {
    module: typescript.ModuleKind.CommonJS,
    target: typescript.ScriptTarget.ES2022,
  },
}).outputText
const module = { exports: {} }
vm.runInNewContext(output, { module, exports: module.exports })
const { ensureLocaleNamespace, installLocaleNamespaceGuard } = module.exports

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)
      && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      merge(target[key], value)
    } else {
      target[key] = clone(value)
    }
  }
}

class FakeComposer {
  messages = {
    'zh-CN': { console: { title: 'Console' } },
    'en-US': { console: { title: 'Console' } },
  }

  getLocaleMessage(locale) {
    return this.messages[locale] ||= {}
  }

  mergeLocaleMessage(locale, messages) {
    merge(this.getLocaleMessage(locale), messages)
  }

  setLocaleMessage(locale, messages) {
    this.messages[locale] = messages
  }
}

const namespace = 'marketNext'
const messages = {
  'zh-CN': {
    common: { labels: { current: '当前' } },
    dependencies: {
      toolbar: { blockPreview: '屏蔽预览' },
      groups: { unconfigured: { label: '已下载未配置' } },
    },
    dependencyCard: { actions: { addConfig: '添加配置' } },
    market: { search: '搜索插件' },
  },
  'en-US': {
    common: { labels: { current: 'Current' } },
    dependencies: {
      toolbar: { blockPreview: 'Hide previews' },
      groups: { unconfigured: { label: 'Installed, Not Configured' } },
    },
    dependencyCard: { actions: { addConfig: 'Add config' } },
    market: { search: 'Search plugins' },
  },
}
const composer = new FakeComposer()

// A pre-alpha.2 bundle registers first, then its delayed dispose removes the
// namespace after the fixed bundle has already registered.
for (const [locale, value] of Object.entries(messages)) {
  composer.mergeLocaleMessage(locale, { [namespace]: { legacy: true, ...value } })
}
assert.equal(ensureLocaleNamespace(composer, namespace, messages), false)

for (const locale of Object.keys(messages)) {
  const current = { ...composer.getLocaleMessage(locale) }
  delete current[namespace]
  composer.setLocaleMessage(locale, current)
}

assert.equal(ensureLocaleNamespace(composer, namespace, messages), true)
for (const [locale, value] of Object.entries(messages)) {
  assert.deepEqual(composer.getLocaleMessage(locale)[namespace], value)
  assert.equal(composer.getLocaleMessage(locale).console.title, 'Console')
}

composer.setLocaleMessage('zh-CN', {
  ...composer.getLocaleMessage('zh-CN'),
  [namespace]: { common: { labels: { current: '旧文案' } } },
})
assert.equal(ensureLocaleNamespace(composer, namespace, messages), true)
assert.deepEqual(composer.getLocaleMessage('zh-CN')[namespace], messages['zh-CN'])

const liveComposer = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
}).global
installLocaleNamespaceGuard(liveComposer, namespace, messages)
const upgradedMessages = {
  ...messages,
  'zh-CN': { ...messages['zh-CN'], market: { ...messages['zh-CN'].market, updated: '最新文案' } },
  'en-US': { ...messages['en-US'], market: { ...messages['en-US'].market, updated: 'Updated copy' } },
}
installLocaleNamespaceGuard(liveComposer, namespace, upgradedMessages)

for (const locale of Object.keys(upgradedMessages)) {
  const current = { ...liveComposer.getLocaleMessage(locale) }
  delete current[namespace]
  liveComposer.setLocaleMessage(locale, current)
}

for (const [locale, value] of Object.entries(upgradedMessages)) {
  assert.equal(
    JSON.stringify(liveComposer.getLocaleMessage(locale)[namespace]),
    JSON.stringify(value),
  )
}

// Assert the actual rendering path shown by the regression report. Restoring
// the namespace object is insufficient if vue-i18n still resolves raw keys.
liveComposer.locale.value = 'zh-CN'
assert.equal(liveComposer.t('marketNext.dependencies.toolbar.blockPreview'), '屏蔽预览')
assert.equal(liveComposer.t('marketNext.dependencies.groups.unconfigured.label'), '已下载未配置')
assert.equal(liveComposer.t('marketNext.dependencyCard.actions.addConfig'), '添加配置')
assert.equal(liveComposer.t('marketNext.common.labels.current'), '当前')

liveComposer.locale.value = 'en-US'
assert.equal(liveComposer.t('marketNext.dependencies.toolbar.blockPreview'), 'Hide previews')
assert.equal(liveComposer.t('marketNext.dependencies.groups.unconfigured.label'), 'Installed, Not Configured')
assert.equal(liveComposer.t('marketNext.dependencyCard.actions.addConfig'), 'Add config')
assert.equal(liveComposer.t('marketNext.common.labels.current'), 'Current')

console.log('i18n lifecycle check passed: legacy cleanup, namespace recovery, and translated UI output')

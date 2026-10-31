import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { parse, compileTemplate } = require('@vue/compiler-sfc')
const sass = require('sass')
const postcss = require('postcss')

for (const ui of ['standard', 've']) {
  const file = ui === 've' ? 'client/variants/ve/dependencies.vue' : 'client/components/dependencies.vue'
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const { descriptor } = parse(source)

  test(`${ui} dependency styles stay inside their page or teleported filter menu`, () => {
    const css = postcss.parse(sass.compileString(descriptor.styles[0].content, { style: 'expanded' }).css)
    css.walkRules(rule => {
      if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return
      for (const selector of rule.selectors) assert.ok(selector.includes(`.deps-ui-${ui}`), selector)
    })
    assert.ok(descriptor.template.content.includes(`popper-class="deps-ui-${ui}"`))
  })

  test(`${ui} dependency apply bar is inside the Koishi page and stays in normal flow`, () => {
    const { ast, errors } = compileTemplate({ source: descriptor.template.content, filename: file, id: ui })
    assert.deepEqual(errors, [])
    let found = false
    function visit(node, layout = false) {
      if (node.tag === 'k-layout') layout = true
      if (node.props?.some(prop => prop.name === 'class' && prop.value?.content === 'deps-apply-bar')) {
        assert.ok(layout)
        found = true
      }
      for (const child of node.children ?? []) visit(child, layout)
      for (const branch of node.branches ?? []) visit(branch, layout)
    }
    visit(ast)
    assert.ok(found)
    const css = postcss.parse(sass.compileString(descriptor.styles[0].content).css)
    css.walkRules(rule => {
      if (!rule.selectors.some(selector => selector.endsWith(' .deps-apply-bar'))) return
      rule.walkDecls('position', decl => assert.ok(!['fixed', 'absolute'].includes(decl.value)))
    })
  })
}

test('standard dependency rows compact before desktop columns exceed the available width', () => {
  const { descriptor } = parse(readFileSync(new URL('../client/components/package.vue', import.meta.url), 'utf8'))
  const css = postcss.parse(sass.compileString(descriptor.styles[0].content).css)
  assert.ok(css.nodes.some(node => node.type === 'atrule' && node.name === 'media'
    && node.params === '(max-width: 900px)' && node.nodes.some(rule => rule.selector === '.is-row')))
})

// These fingerprints come from 89830e07, before PR #28 changed the dialogs.
const original = {
  confirm: ['e1ed73f7dc0e046b87f07f7a86f32b00e23db5e56f4a95e517dbc67429062dd0', 'b9cb64549ad1d88c3fe73ac29f2834e2c2d552c6a8cf80930e92cde44e76ea98'],
  install: ['1fa08eda5c6f256c61225588a5b6755eab7e83330f23b69e1f5c83a05986573a', 'b486867489348f66c8a6a089babaf066b283654b25dcf4c02a0b016d59c00e4f'],
  'install-progress': ['895d9d145ade47c600fb49603bb2bb26525de8a5a58fdb48dd77e2fead90a630', 'cc4505714e18831ad7b819efb01d5e765b81e1dc90d1da290b6481345626fcab'],
}

for (const [name, hashes] of Object.entries(original)) {
  test(`VE ${name} keeps the original Next template and styles, with only CSS isolation`, () => {
    const { descriptor } = parse(readFileSync(new URL(`../client/variants/ve/${name}.vue`, import.meta.url), 'utf8'))
    const hash = source => createHash('sha256').update(source
      .replaceAll('ve-confirm-panel', 'confirm-panel')
      .replaceAll('ve-install-panel', 'install-panel')
      .replaceAll('ve-install-progress-dialog', 'install-progress-dialog')
      .replaceAll('ve-market-remove-dialog', 'market-remove-dialog')
      .replaceAll('ve-term-pulse', 'term-pulse')
      .replaceAll('ve-term-spin', 'term-spin')
      .replaceAll('.install-panel .theme-color {', '.theme-color {')
      .replaceAll('.install-panel .dot-hint::before {', '.dot-hint::before {')
      .replace(/\r\n/g, '\n').trim()).digest('hex')
    assert.equal(hash(descriptor.template.content), hashes[0])
    assert.equal(hash(descriptor.styles[0].content), hashes[1])
    assert.ok(descriptor.scriptSetup.content.includes(`../../composables/use-${name}`))
    const standard = readFileSync(new URL(`../client/components/${name}.vue`, import.meta.url), 'utf8')
    assert.ok(standard.includes(`../composables/use-${name}`))
    assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: name + '.vue', id: name }).errors, [])
    sass.compileString(descriptor.styles[0].content)
  })
}

test('VE dialog polish stays local and keeps opaque Koishi theme surfaces', () => {
  const source = readFileSync(new URL('../client/variants/ve/dialogs.scss', import.meta.url), 'utf8')
  const css = postcss.parse(sass.compileString(source).css)
  css.walkRules(rule => {
    for (const selector of rule.selectors) assert.match(selector, /\.ve-(confirm-panel|install-panel|market-remove-dialog|install-progress-dialog)/)
  })
  assert.ok(source.includes('background: var(--k-card-bg)'))
  assert.ok(source.includes('font-variant-numeric: tabular-nums'))
  assert.ok(!/backdrop-filter|box-shadow|gradient|#[0-9a-f]{3,8}\b/i.test(source))
})

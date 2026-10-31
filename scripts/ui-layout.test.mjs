import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
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

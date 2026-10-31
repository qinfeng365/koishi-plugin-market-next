import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const host = new Set(['vue', 'vue-router', '@vueuse/core', '@koishijs/client'])
export function verifyUiVariants(root = resolve(import.meta.dirname, '..')) {
  const uiFiles = []
  for (const ui of ['standard', 've']) {
    const dir = resolve(root, 'dist', ui)
    const seen = new Set()
    const queue = [resolve(dir, 'index.js')]
    for (const file of queue) {
      if (seen.has(file)) continue
      seen.add(file)
      assert.ok(existsSync(file), `Missing ${ui} chunk: ${file}. Run npm run build first.`)
      const text = readFileSync(file, 'utf8')
      assert.ok(text.trim(), `Empty ${ui} chunk: ${file}`)
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
      assert.equal(source.parseDiagnostics.length, 0, `Invalid JS in ${file}`)
      function visit(node) {
        const spec = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined
        if (spec) {
          assert.ok(ts.isStringLiteralLike(spec), `Nonliteral module import in ${file}`)
          if (spec.text.startsWith('.')) {
            const target = resolve(dirname(file), spec.text)
            assert.ok(!relative(dir, target).startsWith('..'), `${ui} imports outside its Console entry: ${spec.text}`)
            queue.push(target)
          } else {
            assert.ok(host.has(spec.text), `Unexpected browser import in ${ui}: ${spec.text}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    const css = resolve(dir, 'style.css')
    assert.ok(existsSync(css) && statSync(css).size > 0, `Missing or empty ${ui} CSS. Run npm run build first.`)
    uiFiles.push(...[...seen, css].map(file => relative(root, file).replaceAll('\\', '/')))
    console.log(`UI artifact check passed: ${ui}, ${seen.size} JS chunks, ${statSync(resolve(dir, 'index.js')).size + statSync(css).size} entry bytes`)
  }
  return uiFiles
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) verifyUiVariants()

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { verifyUiVariants } from './check-ui-variants.mjs'

test('importing the UI validator does not read or assert build artifacts', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs'
    import { syncBuiltinESMExports } from 'node:module'
    for (const key of ['existsSync', 'statSync', 'readFileSync']) {
      const original = fs[key]
      fs[key] = (file, ...args) => {
        if (/[\\\\/]dist[\\\\/](standard|ve)[\\\\/]/.test(String(file))) throw new Error('artifact accessed on import')
        return original(file, ...args)
      }
    }
    syncBuiltinESMExports()
    const module = await import(${JSON.stringify(new URL('./check-ui-variants.mjs', import.meta.url).href)})
    if (typeof module.verifyUiVariants !== 'function') throw new Error('missing validator')
  `], { encoding: 'utf8' })
  assert.equal(output, '')
})

test('explicit UI validation rejects an unbuilt tree with a build instruction', () => {
  const root = mkdtempSync(join(tmpdir(), 'market-ui-unbuilt-'))
  try {
    assert.throws(() => verifyUiVariants(root), /Missing standard chunk:.*Run npm run build first/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('explicit UI validation follows referenced chunks independently on each call', () => {
  const root = mkdtempSync(join(tmpdir(), 'market-ui-built-'))
  try {
    for (const ui of ['standard', 've']) {
      const dir = join(root, 'dist', ui)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'index.js'), "import 'vue'; export const load = () => import('./chunk.js')")
      writeFileSync(join(dir, 'chunk.js'), 'export default 1')
      writeFileSync(join(dir, 'style.css'), '.page { color: inherit }')
    }
    const files = verifyUiVariants(root)
    assert.deepEqual(files, ['dist/standard/index.js', 'dist/standard/chunk.js', 'dist/standard/style.css',
      'dist/ve/index.js', 'dist/ve/chunk.js', 'dist/ve/style.css'])
    assert.deepEqual(verifyUiVariants(root), files)
    rmSync(join(root, 'dist/ve/chunk.js'))
    assert.throws(() => verifyUiVariants(root), /Missing ve chunk/)
    writeFileSync(join(root, 'dist/ve/chunk.js'), '')
    assert.throws(() => verifyUiVariants(root), /Empty ve chunk/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// Only the filtering logic is needed; avatar and i18n require the console browser.
const result = await build({
  entryPoints: [fileURLToPath(new URL('../client/market/utils.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [{
    name: 'console-stubs',
    setup(build) {
      build.onResolve({ filter: /^\.\/avatar$|^\.\.\/i18n$/ }, args => ({ path: args.path, namespace: 'stub' }))
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const useMarketNextI18n = () => ({})' }))
    },
  }],
})
const { getSilentFiltered } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
const published = { package: { publisher: { username: 'alice' }, maintainers: [] } }
const maintained = { package: { publisher: { name: 'bob' }, maintainers: [{ name: 'alice' }, { username: 'carol' }] } }
const similar = { package: { publisher: { username: 'alice-other' }, maintainers: [{ username: 'alice-other' }] } }
const absent = { package: { maintainers: [] } }
const data = [published, maintained, similar, absent]

test('blocks publishers independently even when maintainers are empty', () => {
  assert.deepEqual(getSilentFiltered(data, [], { blockedPublishers: [' ALICE ', ''] }), [maintained, similar, absent])
  assert.deepEqual(getSilentFiltered(data, [], { blockedPublishers: ['bob'] }), [published, similar, absent])
})

test('blocks any matching maintainer without matching publishers', () => {
  for (const id of ['alice', ' CAROL ']) {
    assert.deepEqual(getSilentFiltered(data, [], { blockedMaintainers: [id] }), [published, similar, absent])
  }
})

test('combines both lists and restores entries when lists are cleared', () => {
  assert.deepEqual(getSilentFiltered(data, [], { blockedPublishers: ['alice'], blockedMaintainers: ['carol'] }), [similar, absent])
  assert.equal(getSilentFiltered(data, [], { blockedPublishers: [], blockedMaintainers: [] }), data)
  assert.equal(getSilentFiltered(data, []), data)
})

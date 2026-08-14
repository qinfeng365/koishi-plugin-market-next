import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { create } from 'tar'

import {
  getLocalPackageOperation,
  LocalPackageUploadStore,
} from '../src/node/local-upload.ts'

async function createPackageArchive(root, manifest) {
  const source = join(root, 'source')
  const packageRoot = join(source, 'package')
  await mkdir(packageRoot, { recursive: true })
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify(manifest, null, 2))
  await writeFile(join(packageRoot, 'index.js'), 'module.exports = {}\n')
  const archive = join(root, 'plugin.tgz')
  await create({ cwd: source, file: archive, gzip: true }, ['package'])
  return archive
}

async function uploadArchive(store, archive) {
  const content = await readFile(archive)
  const started = await store.start({ filename: 'plugin.tgz', size: content.length })
  let index = 0
  for (let offset = 0; offset < content.length; offset += started.chunkSize) {
    await store.append({
      uploadId: started.uploadId,
      index: index++,
      data: content.subarray(offset, offset + started.chunkSize).toString('base64'),
    })
  }
  return { started, content }
}

test('uploads, validates, and commits an npm-packed Koishi plugin', async () => {
  const root = await mkdtemp(join(tmpdir(), 'market-next-local-upload-'))
  const warnings = []
  const store = new LocalPackageUploadStore(root, message => warnings.push(message))
  try {
    const archive = await createPackageArchive(root, {
      name: 'koishi-plugin-local-example',
      version: '1.2.3',
      description: 'local package test',
      main: 'index.js',
      scripts: { postinstall: 'node setup.js' },
    })
    const { started, content } = await uploadArchive(store, archive)
    const preview = await store.finish({ uploadId: started.uploadId })
    assert.equal(preview.manifest.name, 'koishi-plugin-local-example')
    assert.equal(preview.manifest.version, '1.2.3')
    assert.equal(preview.size, content.length)
    assert.match(preview.hash, /^[a-f0-9]{64}$/)
    assert.match(preview.targetFilename, /^koishi-plugin-local-example-1\.2\.3-[a-f0-9]{12}\.tgz$/)

    const committed = await store.commit(started.uploadId)
    assert.equal(committed.name, 'koishi-plugin-local-example')
    assert.equal(committed.version, '1.2.3')
    assert.equal(committed.request, `file:.yarn/local/${committed.filename}`)
    assert.deepEqual(await readFile(join(root, '.yarn', 'local', committed.filename)), content)
    assert.deepEqual(warnings, [])
  } finally {
    await store.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects archives that are not Koishi plugins', async () => {
  const root = await mkdtemp(join(tmpdir(), 'market-next-local-upload-invalid-'))
  const store = new LocalPackageUploadStore(root, () => {})
  try {
    const archive = await createPackageArchive(root, {
      name: 'ordinary-package',
      version: '1.0.0',
      main: 'index.js',
    })
    const { started } = await uploadArchive(store, archive)
    await assert.rejects(
      store.finish({ uploadId: started.uploadId }),
      /不是有效的 Koishi 插件名称/,
    )
  } finally {
    await store.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('classifies same-name local package changes as version operations', () => {
  assert.equal(getLocalPackageOperation(undefined, undefined, '1.0.0'), 'install')
  assert.equal(getLocalPackageOperation('^1.0.0', '1.0.0', '2.0.0'), 'upgrade')
  assert.equal(getLocalPackageOperation('file:.yarn/local/example-2.0.0.tgz', '2.0.0', '1.5.0'), 'downgrade')
  assert.equal(getLocalPackageOperation('file:.yarn/local/example-a.tgz', '1.0.0', '1.0.0'), 'replace')
})

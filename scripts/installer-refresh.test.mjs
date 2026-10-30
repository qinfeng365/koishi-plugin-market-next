import assert from 'node:assert/strict'
import test from 'node:test'

import installerModule from '../src/node/installer.ts'

// Loaded as CommonJS, so the default export sits one level down.
const Installer = installerModule.default

// Versions and statuses reach the console as patches only. A full push at the end of the check
// would replace the versions an open dialog relies on without fetching them again.
test('the end of a dependency check does not push versions or statuses in full', async () => {
  const refreshed = []
  const installer = {
    config: {},
    endpoint: 'https://registry.npmjs.org',
    isStale: () => false,
    metadata: { serial: 1, selectedEndpoint: 'https://registry.npmjs.org' },
    ctx: { get: () => ({ refresh: key => refreshed.push(key), services: {} }) },
  }
  await Installer.prototype._refreshDependencyMetadata.call(installer, {
    example: { request: 'file:example.tgz', local: true },
  }, 1)
  assert.equal(installer.depMetadataFresh, true)
  assert.deepEqual(refreshed, ['dependencies'])
})

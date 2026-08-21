import { Context } from 'koishi'
import pMap from 'p-map'
import { Config, updateMarketNextConfig } from './config'
import { MarketDataStore } from './data'
import { installBundle } from './bundle-installer'
import { ensurePluginConfig, ensurePluginConfigs, removeBundleConfigs } from './plugin-config'
import { fetchAvatar } from './avatar'
import { lookupMarket, MarketSnapshotTransport } from './market-snapshot'
import type { MarketSnapshotResponse } from '../shared'

const SELF_PACKAGE = 'koishi-plugin-market-next'

export function setupConsoleListeners(
  ctx: Context,
  config: Config,
  dataStore: MarketDataStore,
  marketSnapshotTransport: MarketSnapshotTransport,
) {
  ctx.console.addListener('market/install', async (deps, forced, options) => {
    options ||= {}
    const installNames = Object.entries(deps)
      .filter(([, version]) => version)
      .map(([name]) => name)
      .filter(name => name !== SELF_PACKAGE)
    const code = await ctx.installer.install(deps, forced, installNames.length
      ? () => ensurePluginConfigs(ctx, installNames)
      : undefined, options)
    if (!code) {
      await ensurePluginConfigs(ctx, installNames)
    }
    await Promise.all([
      ctx.get('console')?.refresh('dependencies'),
      ctx.get('console')?.refresh('registry'),
      ctx.get('console')?.refresh('packages'),
      ctx.get('console')?.refresh('config'),
    ])
    return code
  }, { authority: 4 })

  ctx.console.addListener('market/install-bundle', async (request, forced, options) => {
    options ||= {}
    return installBundle(ctx, dataStore, request, forced, options)
  }, { authority: 4 })

  ctx.console.addListener('market/install-fallback-candidate', async (failedEndpoint) => {
    return ctx.installer.getInstallFallbackCandidate(failedEndpoint)
  }, { authority: 4 })

  ctx.console.addListener('market/install-history', async (limit) => {
    return ctx.installer.getInstallHistory(limit)
  }, { authority: 4 })

  ctx.console.addListener('market/install-history-detail', async (id) => {
    return ctx.installer.getInstallLogDetail(id)
  }, { authority: 4 })

  ctx.console.addListener('market/local-package-upload-start', async (request) => {
    return ctx.installer.startLocalPackageUpload(request)
  }, { authority: 4 })

  ctx.console.addListener('market/local-package-upload-chunk', async (request) => {
    return ctx.installer.appendLocalPackageUpload(request)
  }, { authority: 4 })

  ctx.console.addListener('market/local-package-upload-finish', async (request) => {
    return ctx.installer.finishLocalPackageUpload(request)
  }, { authority: 4 })

  ctx.console.addListener('market/local-package-upload-commit', async (uploadId) => {
    return ctx.installer.commitLocalPackageUpload(uploadId)
  }, { authority: 4 })

  ctx.console.addListener('market/local-package-upload-cancel', async (uploadId) => {
    return ctx.installer.cancelLocalPackageUpload(uploadId)
  }, { authority: 4 })

  ctx.console.addListener('market/prepare-local-binding', async (name) => {
    return ctx.installer.prepareLocalBinding(name)
  }, { authority: 4 })

  ctx.console.addListener('market/environment-snapshots', async () => {
    return ctx.installer.getEnvironmentSnapshots()
  }, { authority: 4 })

  ctx.console.addListener('market/environment-snapshot-preview', async (id) => {
    return ctx.installer.getEnvironmentSnapshotPreview(id)
  }, { authority: 4 })

  ctx.console.addListener('market/environment-snapshot-apply', async (id, options) => {
    const code = await ctx.installer.applyEnvironmentSnapshot(id, options)
    await Promise.all([
      ctx.get('console')?.refresh('dependencies'),
      ctx.get('console')?.refresh('registry'),
      ctx.get('console')?.refresh('packages'),
    ])
    return code
  }, { authority: 4 })

  ctx.console.addListener('market/remove-bundle-configs', async (request) => {
    return removeBundleConfigs(ctx, request)
  }, { authority: 4 })

  ctx.console.addListener('market/update-config', async (patch) => {
    return updateMarketNextConfig(ctx, config, patch)
  }, { authority: 4 })

  ctx.console.addListener('market/update-data', async (patch) => {
    return dataStore.patch(patch)
  }, { authority: 4 })

  ctx.console.addListener('market/refresh-dependencies', async () => {
    await ctx.installer.refresh(true)
    await ctx.get('console')?.refresh('config')
  }, { authority: 4 })

  ctx.console.addListener('market/package', async (name) => {
    return ctx.installer.getRegistry(name)
  }, { authority: 4 })

  ctx.console.addListener('market/index', async (request) => {
    const snapshot = await ctx.console.services.market?.getSnapshot?.()
    if (!snapshot || request?.transport !== 'http-gzip') return snapshot as MarketSnapshotResponse
    return marketSnapshotTransport.create(snapshot)
  }, { authority: 4 })

  ctx.console.addListener('market/lookup', async (request) => {
    return lookupMarket(ctx.console.services.market, request)
  }, { authority: 4 })

  ctx.console.addListener('market/registry', async (names) => {
    const entries = await pMap(names, async (name) => {
      try {
        const meta = await ctx.installer.getPackage(name)
        if (!meta) return
        return [name, meta] as const
      } catch (error) {
        ctx.logger('market').debug(`skip registry metadata for ${name}: ${error instanceof Error ? error.message : error}`)
      }
    }, { concurrency: ctx.installer.config.concurrency ?? 4 })
    return Object.fromEntries(entries.filter(Boolean))
  }, { authority: 4 })

  ctx.console.addListener('market/ensure-config', async (name) => {
    return ensurePluginConfig(ctx, name)
  }, { authority: 4 })

  ctx.console.addListener('market/avatar', async (key, url) => {
    try {
      return await fetchAvatar(ctx, key, url)
    } catch (error) {
      ctx.logger('market').debug(`avatar fetch failed: ${error instanceof Error ? error.message : error}`)
    }
  }, { authority: 4 })
}

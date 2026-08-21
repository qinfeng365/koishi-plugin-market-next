import { Context, Time } from 'koishi'
import Scanner from '@koishijs/registry'
import { loadManifest } from './installer-types'
import {
  BUNDLE_KEYWORD,
  BundleConfigRemoveRequest,
  BundleConfigRemoveResult,
  PluginBundleManifest,
  getBundleGroupIdent,
  getPluginShortname,
  isBundlePackageName,
  parseBundleManifest,
} from '../shared/bundle'

const SELF_PACKAGE = 'koishi-plugin-market-next'

export function hasPluginConfig(plugins: any, shortname: string): boolean {
  for (const key in plugins || {}) {
    if (key.startsWith('$')) continue
    const [prefix] = key.split(':', 1)
    const name = prefix.replace(/^~/, '')
    if (name === shortname) return true
    if (name === 'group' && hasPluginConfig(plugins[key], shortname)) return true
  }
  return false
}

export function findPluginConfig(plugins: any, shortname: string, group?: any): { key: string, parent: any, inGroup: boolean, value: any } | undefined {
  for (const key in plugins || {}) {
    if (key.startsWith('$')) continue
    const value = plugins[key]
    const [prefix] = key.split(':', 1)
    const name = prefix.replace(/^~/, '')
    if (name === shortname) return { key, parent: plugins, inGroup: !!group && plugins === group, value }
    if (name === 'group') {
      const found = findPluginConfig(value, shortname, group)
      if (found) return found
    }
  }
}

export function hasPluginConfigInGroup(plugins: any, shortname: string) {
  for (const key in plugins || {}) {
    if (key.startsWith('$')) continue
    const [prefix] = key.split(':', 1)
    const name = prefix.replace(/^~/, '')
    if (name === shortname) return true
  }
  return false
}

function createDisabledPluginConfig(ctx: Context, shortname: string) {
  const plugins = ctx.loader.config?.plugins
  if (!plugins || !ctx.loader.writable) return
  let ident: string
  let key: string
  do {
    ident = Math.random().toString(36).slice(2, 8)
    key = `~${shortname}:${ident}`
  } while (key in plugins)
  plugins[key] = {}
  return key
}

function isPluginBundleDependency(name: string) {
  if (isBundlePackageName(name)) return true
  try {
    const meta = loadManifest(name)
    return !!parseBundleManifest((meta.koishi as any)?.bundle)
      || meta.keywords?.some(keyword => keyword.toLowerCase() === BUNDLE_KEYWORD)
  } catch {
    return false
  }
}

async function requestPluginRuntime(ctx: Context, name: string) {
  await ctx.get('console')?.listeners['config/request-runtime']?.callback.call(null, name)
}

export async function ensurePluginConfig(ctx: Context, name: string, write = true) {
  if (!Scanner.isPlugin(name)) return false
  if (name === SELF_PACKAGE) return false
  if (isPluginBundleDependency(name)) {
    ctx.logger('market').debug(`skip default config entry for plugin bundle: ${name}`)
    return false
  }

  const shortname = getPluginShortname(name)
  if (hasPluginConfig(ctx.loader.config?.plugins, shortname)) return false

  await requestPluginRuntime(ctx, name).catch(error => ctx.logger('market').warn(error))
  if (hasPluginConfig(ctx.loader.config?.plugins, shortname)) return false

  const key = createDisabledPluginConfig(ctx, shortname)
  if (!key) return false
  if (write) await ctx.loader.writeConfig()
  ctx.logger('market').info('created disabled default config entry %c for %c', key, name)
  return true
}

export async function ensurePluginConfigs(ctx: Context, names: string[]) {
  const start = Date.now()
  let changed = false
  let checked = 0
  for (const name of names.filter(name => Scanner.isPlugin(name))) {
    if (!ctx.scope.isActive) return false
    if (await ensurePluginConfig(ctx, name, false)) changed = true
    if (++checked % 20 === 0) await sleep(0)
  }
  if (!changed) return false
  await ctx.loader.writeConfig()
  await Promise.all([
    ctx.get('console')?.refresh('config'),
    ctx.get('console')?.refresh('packages'),
  ])
  ctx.logger('market').info(`plugin config ensure completed: checked=${checked}, elapsed=${Date.now() - start}ms`)
  return true
}

export async function ensureInstalledPluginConfigs(ctx: Context) {
  const start = Date.now()
  const manifest = loadManifest(ctx.baseDir)
  const names = Object.keys(manifest.dependencies ?? {})
    .filter(name => Scanner.isPlugin(name))
    .filter(name => !isPluginBundleDependency(name))
  const missing = names.filter(name => !hasPluginConfig(ctx.loader.config?.plugins, getPluginShortname(name)))
  ctx.logger('market').debug(`installed plugin config repair scan: total=${names.length}, missing=${missing.length}`)
  if (!missing.length) return false
  await sleep(0)
  const changed = await ensurePluginConfigs(ctx, missing)
  ctx.logger('market').info(`installed plugin config repair scan completed: total=${names.length}, missing=${missing.length}, changed=${changed}, elapsed=${Date.now() - start}ms`)
  return changed
}

export interface BundleGroup {
  key: string
  plugins: any
  changed?: boolean
}

export function getBundleGroup(ctx: Context, packageName: string): BundleGroup | undefined {
  const plugins = ctx.loader.config?.plugins
  if (!plugins) return
  const key = `group:${getBundleGroupIdent(packageName)}`
  if (!plugins[key]) return
  return { key, plugins: plugins[key] }
}

export function ensureBundleGroup(ctx: Context, packageName: string, bundle: PluginBundleManifest): BundleGroup | undefined {
  const plugins = ctx.loader.config?.plugins
  if (!plugins || !ctx.loader.writable) return
  const ident = getBundleGroupIdent(packageName)
  const key = `group:${ident}`
  let changed = false
  if (!plugins[key]) {
    plugins[key] = {}
    changed = true
  }
  if (!plugins[key].$label) {
    plugins[key].$label = bundle.label || getPluginShortname(packageName)
    changed = true
  }
  if (plugins[key].$collapsed === undefined) {
    plugins[key].$collapsed = false
    changed = true
  }
  return { key, plugins: plugins[key], changed }
}

export async function removeBundleConfigs(ctx: Context, request: BundleConfigRemoveRequest): Promise<BundleConfigRemoveResult> {
  const group = getBundleGroup(ctx, request.package)
  const result: BundleConfigRemoveResult = {
    groupKey: group?.key,
    removed: [],
  }
  if (!group || !ctx.loader.writable) return result

  const memberNames = new Set((request.members ?? [])
    .map(member => getPluginShortname(member.plugin || member.package))
    .filter(Boolean))
  let needsFullReload = false

  for (const key of Object.keys(group.plugins)) {
    if (key.startsWith('$')) continue
    const [prefix] = key.split(':', 1)
    const shortname = prefix.replace(/^~/, '')
    if (memberNames.size && !memberNames.has(shortname)) continue
    delete group.plugins[key]
    result.removed.push(key)
    if (!key.startsWith('~')) needsFullReload = true
  }

  const children = Object.keys(group.plugins).filter(key => !key.startsWith('$'))
  if (request.removeEmptyGroup !== false && !children.length) {
    delete ctx.loader.config.plugins[group.key]
    result.removedGroup = true
  }

  if (result.removed.length || result.removedGroup) {
    await ctx.loader.writeConfig()
    await Promise.all([
      ctx.get('console')?.refresh('config'),
      ctx.get('console')?.refresh('packages'),
    ])
    ctx.logger('market').info(`plugin bundle config cleanup completed: bundle=${request.package}, removed=${result.removed.length}, removedGroup=${!!result.removedGroup}`)
    if (needsFullReload) {
      setTimeout(() => {
        if (ctx.scope.isActive) ctx.loader.fullReload()
      }, Time.second)
    }
  }

  return result
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

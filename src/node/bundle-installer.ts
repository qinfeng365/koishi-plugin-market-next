import { Context, Dict } from 'koishi'
import { maxSatisfying } from 'semver'
import { MarketDataStore } from './data'
import { loadManifest, type InstallOptions } from './installer-types'
import {
  ensureBundleGroup,
  findPluginConfig,
  getBundleGroup,
  hasPluginConfigInGroup,
  type BundleGroup,
} from './plugin-config'
import {
  BUNDLE_KEYWORD,
  BundleInstallMember,
  BundleInstallRequest,
  BundleInstallResult,
  PluginBundleRecord,
  getBundleMemberIdent,
  getPluginShortname,
  parseBundleManifest,
  validateBundleManifest,
} from '../shared/bundle'

async function assertNoDirectBundleCycles(ctx: Context, packageName: string, members: BundleInstallMember[]) {
  const bundleName = packageName.toLowerCase()
  for (const member of members) {
    try {
      const registry = await ctx.installer.getRegistry(member.package)
      const versions = Object.keys(registry?.versions ?? {})
      const version = maxSatisfying(versions, member.version, { includePrerelease: true })
      if (!version) continue
      const remote = registry.versions?.[version]
      const bundle = parseBundleManifest((remote?.koishi as any)?.bundle)
      if (!bundle?.members.some(item => item.package.toLowerCase() === bundleName)) continue
      throw new Error(`plugin bundle has a direct cycle: ${packageName} <-> ${member.package}`)
    } catch (error) {
      if (error instanceof Error && error.message.includes('direct cycle')) throw error
      ctx.logger('market').debug(`plugin bundle cycle check skipped: bundle=${packageName}, member=${member.package}, error=${error instanceof Error ? error.message : error}`)
    }
  }
}

export async function installBundle(ctx: Context, dataStore: MarketDataStore, request: BundleInstallRequest, forced?: boolean, options: InstallOptions = {}): Promise<BundleInstallResult> {
  options ||= {}
  const start = Date.now()
  if (!request.version) throw new Error('bundle package version is required')
  const registry = await ctx.installer.getRegistry(request.package)
  if (!registry?.versions) throw new Error(`bundle package metadata not loaded: ${request.package}`)
  const remote = registry.versions[request.version]
  if (!remote) throw new Error(`bundle package version not found: ${request.package}@${request.version}`)
  const bundle = parseBundleManifest((remote?.koishi as any)?.bundle)
  const validation = validateBundleManifest(request.package, bundle, {
    keyword: remote?.keywords?.some(keyword => keyword.toLowerCase() === BUNDLE_KEYWORD),
  })
  if (!validation.valid) {
    throw new Error(`invalid plugin bundle: ${validation.errors.join('; ')}`)
  }
  const manifest = bundle!

  const requestMembers = new Map((request.members ?? []).map(member => [`${member.package}\n${member.plugin}`, member]))
  const selected = manifest.members
    .map((member) => {
      const option = requestMembers.get(`${member.package}\n${member.plugin}`)
      return {
        ...member,
        selected: !!option?.selected,
        createConfig: option?.createConfig !== false,
        usePreset: option?.usePreset === true,
        move: option?.move === true,
        config: option?.config ?? member.config,
      }
    })
    .filter(member => member.selected)
  if (!selected.length) throw new Error('plugin bundle has no selected members')
  await assertNoDirectBundleCycles(ctx, request.package, selected)

  const beforeDeps = loadManifest(ctx.baseDir).dependencies ?? {}
  const deps: Dict<string> = { [request.package]: request.version }
  for (const member of selected) {
    deps[member.package] = member.version
  }

  const configured: string[] = []
  const moved: string[] = []
  const skipped: string[] = []
  let group: BundleGroup | undefined
  let groupChanged = false
  let wroteConfig = false
  const writeBundleConfigs = async () => {
    if (wroteConfig) return
    group = ensureBundleGroup(ctx, request.package, manifest) ?? getBundleGroup(ctx, request.package)
    groupChanged ||= !!group?.changed
    for (const member of selected) {
      if (!member.createConfig) {
        skipped.push(member.package)
        continue
      }
      const shortname = member.plugin || getPluginShortname(member.package)
      group ||= ensureBundleGroup(ctx, request.package, manifest)
      groupChanged ||= !!group?.changed
      if (!group) {
        skipped.push(member.package)
        continue
      }

      if (hasPluginConfigInGroup(group.plugins, shortname)) continue

      const existing = findPluginConfig(ctx.loader.config?.plugins, shortname, group.plugins)
      if (existing && existing.parent !== group.plugins && member.move) {
        const ident = getBundleMemberIdent(request.package, member)
        const fallbackKey = `~${shortname}:${ident}`
        const targetKey = existing.key in group.plugins ? fallbackKey : existing.key
        if (targetKey in group.plugins) {
          skipped.push(member.package)
          continue
        }
        group.plugins[targetKey] = existing.value ?? {}
        delete existing.parent[existing.key]
        moved.push(member.package)
        continue
      }

      const ident = getBundleMemberIdent(request.package, member)
      const key = `~${shortname}:${ident}`
      if (group.plugins[key]) continue
      group.plugins[key] = member.usePreset ? member.config || {} : {}
      configured.push(member.package)
    }
    if (groupChanged || configured.length || moved.length) await ctx.loader.writeConfig()
    wroteConfig = true
  }

  const code = await ctx.installer.install(deps, forced, writeBundleConfigs, options)

  if (!code) {
    await writeBundleConfigs()
  }

  await Promise.all([
    ctx.get('console')?.refresh('dependencies'),
    ctx.get('console')?.refresh('registry'),
    ctx.get('console')?.refresh('packages'),
    ctx.get('console')?.refresh('config'),
  ])
  const record: PluginBundleRecord | undefined = code ? undefined : {
    package: request.package,
    version: request.version,
    label: manifest.label,
    groupKey: group?.key,
    installedAt: Date.now(),
    members: selected.map(member => ({
      package: member.package,
      plugin: member.plugin,
      version: member.version,
      required: member.required,
      selected: true,
      installedByBundle: !beforeDeps[member.package],
      configured: configured.includes(member.package),
      moved: moved.includes(member.package),
      skipped: skipped.includes(member.package),
      usePreset: member.usePreset,
    })),
  }
  if (record) await dataStore.setBundleRecord(record)
  ctx.logger('market').info(`plugin bundle install completed: bundle=${request.package}, members=${selected.length}, configured=${configured.length}, moved=${moved.length}, skipped=${skipped.length}, code=${code}, elapsed=${Date.now() - start}ms`)
  return {
    code,
    installed: Object.keys(deps),
    configured,
    moved,
    skipped,
    groupKey: group?.key,
    record,
  }
}

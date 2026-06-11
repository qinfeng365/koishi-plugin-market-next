import { Context, Dict, pick, Schema } from 'koishi'
import Scanner, { DependencyMetaKey, Registry, RemotePackage } from '@koishijs/registry'
import { gt, maxSatisfying } from 'semver'
import { resolve } from 'path'
import pMap from 'p-map'
import { DependencyProvider, RegistryProvider, RegistryStatusProvider } from './deps'
import Installer, { loadManifest } from './installer'
import MarketProvider from './market'
import { applyChatLunaTool } from './chatluna'
import {
  BUNDLE_KEYWORD,
  BundleConfigRemoveRequest,
  BundleConfigRemoveResult,
  BundleInstallRequest,
  BundleInstallResult,
  BundleInstallMember,
  PluginBundleManifest,
  PluginBundleRecord,
  getBundleGroupIdent,
  getBundleMemberIdent,
  getPluginShortname,
  isBundlePackageName,
  parseBundleManifest,
  validateBundleManifest,
} from '../shared/bundle'

export * from '../shared'

export { Installer }

declare module 'koishi' {
  interface Context {
    installer: Installer
  }
}

declare module '@koishijs/console' {
  namespace Console {
    interface Services {
      dependencies: DependencyProvider
      registry: RegistryProvider
      registryStatus: RegistryStatusProvider
    }
  }

  interface Events {
    'market/install'(deps: Dict<string>, forced?: boolean): Promise<number>
    'market/install-bundle'(request: BundleInstallRequest, forced?: boolean): Promise<BundleInstallResult>
    'market/remove-bundle-configs'(request: BundleConfigRemoveRequest): Promise<BundleConfigRemoveResult>
    'market/refresh-dependencies'(): Promise<void>
    'market/package'(name: string): Promise<Registry>
    'market/registry'(names: string[]): Promise<Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>>
    'market/ensure-config'(name: string): Promise<boolean>
  }
}

export const name = 'market'
export const inject = ['http']

export const usage = `
如果插件市场页面提示「无法连接到插件市场」，则可以选择一个 Koishi 社区提供的镜像地址，填入下方对应的配置项中。

## 插件市场（填入 search.endpoint）

- Koishi（全球）：https://registry.koishi.chat/index.json
- [Gitee 聚合](https://k.ilharp.cc/4000)（大陆）：https://gitee.com/shangxueink/koishi-registry-aggregator/raw/gh-pages/market.json
- [t4wefan](https://k.ilharp.cc/2611)（大陆）：https://registry.koishi.t4wefan.pub/index.json
- [Lipraty](https://k.ilharp.cc/3530)（大陆）：https://koi.nyan.zone/registry/index.json
- [itzdrli](https://k.ilharp.cc/9975)（全球）：https://kp.itzdrli.cc
- itzdrli 备用：https://koishi.itzdrli.cc

要浏览更多社区镜像，请访问 [Koishi 论坛上的镜像一览](https://k.ilharp.cc/4000)。`

// ## 软件源（填入 npmRegistryServer）

// - 淘宝（大陆）：https://registry.npmmirror.com
// - 腾讯（大陆）：https://mirrors.cloud.tencent.com/npm
// - npm（全球）：https://registry.npmjs.org
// - cnpm：https://r.cnpmjs.org

export interface Config {
  registry?: Installer.Config
  search?: MarketProvider.Config
  chatlunaTool?: boolean
  frontendMode?: 'performance' | 'polished'
  depsLayout?: 'grid' | 'list'
  marketLayout?: 'grid' | 'list'
}

export const Config: Schema<Config> = Schema.object({
  frontendMode: Schema.union([
    Schema.const('performance').description('性能模式'),
    Schema.const('polished').description('精致模式'),
  ]).role('radio').default('performance').description('Frontend display mode.'),
  depsLayout: Schema.union([
    Schema.const('grid').description('网格'),
    Schema.const('list').description('列表'),
  ]).role('radio').default('grid').description('Dependencies page layout.'),
  marketLayout: Schema.union([
    Schema.const('grid').description('网格'),
    Schema.const('list').description('列表'),
  ]).role('radio').default('grid').description('Market page layout.'),
  registry: Installer.Config,
  search: MarketProvider.Config,
  chatlunaTool: Schema.boolean().default(false).description('Enable ChatLuna plugin market query tool.'),
}).i18n({
  'zh-CN': require('./locales/schema.zh-CN'),
})

function hasPluginConfig(plugins: any, shortname: string): boolean {
  for (const key in plugins || {}) {
    if (key.startsWith('$')) continue
    const [prefix] = key.split(':', 1)
    const name = prefix.replace(/^~/, '')
    if (name === shortname) return true
    if (name === 'group' && hasPluginConfig(plugins[key], shortname)) return true
  }
  return false
}

function findPluginConfig(plugins: any, shortname: string, group?: any): { key: string, parent: any, inGroup: boolean, value: any } | undefined {
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

function hasPluginConfigInGroup(plugins: any, shortname: string) {
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

async function ensurePluginConfig(ctx: Context, name: string, write = true) {
  if (!Scanner.isPlugin(name)) return false
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

async function ensurePluginConfigs(ctx: Context, names: string[]) {
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

async function ensureInstalledPluginConfigs(ctx: Context) {
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

interface BundleGroup {
  key: string
  plugins: any
  changed?: boolean
}

function getBundleGroup(ctx: Context, packageName: string): BundleGroup | undefined {
  const plugins = ctx.loader.config?.plugins
  if (!plugins) return
  const key = `group:${getBundleGroupIdent(packageName)}`
  if (!plugins[key]) return
  return { key, plugins: plugins[key] }
}

function ensureBundleGroup(ctx: Context, packageName: string, bundle: PluginBundleManifest): BundleGroup | undefined {
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

async function removeBundleConfigs(ctx: Context, request: BundleConfigRemoveRequest): Promise<BundleConfigRemoveResult> {
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
    if (needsFullReload) ctx.loader.fullReload()
  }

  return result
}

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

async function installBundle(ctx: Context, request: BundleInstallRequest, forced?: boolean): Promise<BundleInstallResult> {
  const start = Date.now()
  const registry = await ctx.installer.getRegistry(request.package)
  const remote = registry?.versions?.[request.version]
  if (!remote) throw new Error(`bundle package version not found: ${request.package}@${request.version}`)
  const bundle = parseBundleManifest((remote?.koishi as any)?.bundle)
  const validation = validateBundleManifest(request.package, bundle, {
    keyword: remote?.keywords?.some(keyword => keyword.toLowerCase() === BUNDLE_KEYWORD),
  })
  if (!validation.valid) {
    throw new Error(`invalid plugin bundle: ${validation.errors.join('; ')}`)
  }
  if (!request.version) throw new Error('bundle package version is required')
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
    wroteConfig = true
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
  }

  const code = await ctx.installer.install(deps, forced, writeBundleConfigs)

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

export function apply(ctx: Context, config: Config = {}) {
  if (!ctx.loader?.writable) {
    return ctx.logger('app').warn('koishi-plugin-market-next is only available for json/yaml config file')
  }

  applyChatLunaTool(ctx, config)

  ctx.plugin(Installer, config.registry ?? {})

  ctx.inject(['installer'], (ctx) => {
    ctx.i18n.define('zh-CN', require('./locales/message.zh-CN'))

    ctx.command('plugin.install <name>', { authority: 4 })
      .alias('.i')
      .action(async ({ session }, name) => {
        if (!name) return session.text('.expect-name')

        // check local dependencies
        const names = ctx.installer.resolveName(name)
        const deps = await ctx.installer.getDeps()
        name = names.find((name) => deps[name])
        if (name) return session.text('.already-installed')

        // find proper version
        const result = await ctx.installer.findVersion(names)
        if (!result) return session.text('.not-found')

        // set restart message
        ctx.loader.envData.message = {
          ...pick(session, ['sid', 'channelId', 'guildId', 'isDirect']),
          content: session.text('.success'),
        }
        await ctx.installer.install(result, undefined, () => ensurePluginConfigs(ctx, Object.keys(result)))
        await ensurePluginConfigs(ctx, Object.keys(result))
        ctx.loader.envData.message = null
        return session.text('.success')
      })

    ctx.command('plugin.uninstall <name>', { authority: 4 })
      .alias('.r')
      .action(async ({ session }, name) => {
        if (!name) return session.text('.expect-name')

        // check local dependencies
        const names = ctx.installer.resolveName(name)
        const deps = await ctx.installer.getDeps()
        name = names.find((name) => deps[name])
        if (!name) return session.text('.not-installed')

        await ctx.installer.install({ [name]: null })
        return session.text('.success')
      })

    ctx.command('plugin.upgrade [name...]', { authority: 4 })
      .alias('.update', '.up')
      .option('self', '-s, --koishi')
      .action(async ({ session, options }, ...names) => {
        async function getPackages(names: string[]) {
          if (!names.length) return Object.keys(deps)
          names = names.map((name) => {
            const names = ctx.installer.resolveName(name)
            return names.find((name) => deps[name])
          }).filter(Boolean)
          if (options.self) names.push('koishi')
          return names
        }

        // refresh dependencies
        await ctx.installer.refresh(true, true)
        const deps = await ctx.installer.getDeps({ background: false })
        names = await getPackages(names)
        names = names.filter((name) => {
          const { latest, resolved, invalid } = deps[name]
          try {
            return !invalid && gt(latest, resolved)
          } catch {}
        })
        if (!names.length) return session.text('.all-updated')

        const output = names.map((name) => {
          const { latest, resolved } = deps[name]
          return `${name}: ${resolved} -> ${latest}`
        })
        output.unshift(session.text('.available'))
        output.push(session.text('.prompt'))
        await session.send(output.join('\n'))
        const result = await session.prompt()
        if (!['Y', 'y'].includes(result?.trim())) {
          return session.text('.cancelled')
        }

        ctx.loader.envData.message = {
          ...pick(session, ['sid', 'channelId', 'guildId', 'isDirect']),
          content: session.text('.success'),
        }
        await ctx.installer.install(names.reduce((result, name) => {
          result[name] = deps[name].latest
          return result
        }, {}), undefined, () => ensurePluginConfigs(ctx, names))
        await ensurePluginConfigs(ctx, names)
        ctx.loader.envData.message = null
        return session.text('.success')
      })
  })

  ctx.inject(['console', 'installer'], (ctx) => {
    ctx.plugin(DependencyProvider)
    ctx.plugin(RegistryProvider)
    ctx.plugin(RegistryStatusProvider)
    ctx.plugin(MarketProvider, config.search ?? {})

    ctx.console.addEntry({
      dev: resolve(__dirname, '../../client/index.ts'),
      prod: resolve(__dirname, '../../dist'),
    })

    ctx.console.addListener('market/install', async (deps, forced) => {
      const installNames = Object.entries(deps)
        .filter(([, version]) => version)
        .map(([name]) => name)
      const code = await ctx.installer.install(deps, forced, () => ensurePluginConfigs(ctx, installNames))
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

    ctx.console.addListener('market/install-bundle', async (request, forced) => {
      return installBundle(ctx, request, forced)
    }, { authority: 4 })

    ctx.console.addListener('market/remove-bundle-configs', async (request) => {
      return removeBundleConfigs(ctx, request)
    }, { authority: 4 })

    ctx.console.addListener('market/refresh-dependencies', async () => {
      await ctx.installer.refresh(true)
      await ctx.get('console')?.refresh('config')
    }, { authority: 4 })

    ctx.console.addListener('market/package', async (name) => {
      return ctx.installer.getRegistry(name)
    }, { authority: 4 })

    ctx.console.addListener('market/registry', async (names) => {
      const entries = await pMap(names, async (name) => {
        const meta = await ctx.installer.getPackage(name)
        if (!meta) return
        return [name, meta] as const
      }, { concurrency: ctx.installer.config.concurrency ?? 4 })
      return Object.fromEntries(entries.filter(Boolean))
    }, { authority: 4 })

    ctx.console.addListener('market/ensure-config', async (name) => {
      return ensurePluginConfig(ctx, name)
    }, { authority: 4 })

    ctx.on('ready', () => {
      const timer = setTimeout(() => {
        if (!ctx.scope.isActive) return
        ctx.logger('market').debug('schedule installed plugin config repair after market-next ready')
        void ensureInstalledPluginConfigs(ctx).catch(error => ctx.logger('market').warn(error))
      }, 1000)
      ctx.effect(() => () => clearTimeout(timer))
    })
  })
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

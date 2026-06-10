import { Context, Dict, pick, Schema } from 'koishi'
import Scanner, { DependencyMetaKey, Registry, RemotePackage } from '@koishijs/registry'
import { gt } from 'semver'
import { resolve } from 'path'
import pMap from 'p-map'
import { DependencyProvider, RegistryProvider, RegistryStatusProvider } from './deps'
import Installer, { loadManifest } from './installer'
import MarketProvider from './market'
import { applyChatLunaTool } from './chatluna'

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

function getPluginShortname(name: string) {
  return name.replace(/(koishi-|^@koishijs\/)plugin-/, '')
}

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

async function requestPluginRuntime(ctx: Context, name: string) {
  await ctx.get('console')?.listeners['config/request-runtime']?.callback.call(null, name)
}

async function ensurePluginConfig(ctx: Context, name: string, write = true) {
  if (!Scanner.isPlugin(name)) return false

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
  const missing = names.filter(name => !hasPluginConfig(ctx.loader.config?.plugins, getPluginShortname(name)))
  ctx.logger('market').debug(`installed plugin config repair scan: total=${names.length}, missing=${missing.length}`)
  if (!missing.length) return false
  await sleep(0)
  const changed = await ensurePluginConfigs(ctx, missing)
  ctx.logger('market').info(`installed plugin config repair scan completed: total=${names.length}, missing=${missing.length}, changed=${changed}, elapsed=${Date.now() - start}ms`)
  return changed
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

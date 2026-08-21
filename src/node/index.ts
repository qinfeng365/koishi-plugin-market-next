import { Context, Dict, pick } from 'koishi'
import { DependencyMetaKey, Registry, RemotePackage } from '@koishijs/registry'
import { resolve } from 'path'
import { DependencyProvider, RegistryProvider, RegistryStatusProvider } from './deps'
import { MarketDataStore, MarketDataStorePayload, readMarketDataStore } from './data'
import Installer, {
  InstallFallbackCandidate,
  InstallHistoryEntry,
  InstallLogDetail,
  LocalBindingResult,
  InstallOptions,
} from './installer'
import MarketProvider from './market'
import type {
  EnvironmentSnapshotPreview,
  EnvironmentSnapshotSummary,
} from './environment'
import type {
  LocalPackageUploadChunkRequest,
  LocalPackageUploadCommitResult,
  LocalPackageUploadFinishRequest,
  LocalPackageUploadPreview,
  LocalPackageUploadProgress,
  LocalPackageUploadStartRequest,
  LocalPackageUploadStartResult,
} from './local-upload'
import { applyChatLunaTool } from './chatluna'
import { setupIdleProbe } from './idle-probe'
import { setupConsoleListeners } from './console-listeners'
import {
  ensureInstalledPluginConfigs,
  ensurePluginConfigs,
} from './plugin-config'
import {
  clearAvatarCacheStorage,
  startAvatarCacheMaintenance,
  type AvatarFetchResult,
} from './avatar'
import {
  Config,
  ensureMarketNextConfigDefaults,
  removeLegacyCollapsedGroupsConfig,
} from './config'
import { MarketSnapshotTransport } from './market-snapshot'
import {
  BundleConfigRemoveRequest,
  BundleConfigRemoveResult,
  BundleInstallRequest,
  BundleInstallResult,
} from '../shared/bundle'
import {
  getLatestAllowedUpdate,
  getUpdateCandidates,
  type UpdateIgnorePolicy,
} from '../shared/update'
export * from '../shared'
export { Config } from './config'

export { Installer }
export type { InstallHistoryChange, InstallHistoryEntry, InstallHistoryStatus, InstallLogDetail } from './installer'
export type {
  LocalPackageOperation,
  LocalPackageUploadChunkRequest,
  LocalPackageUploadCommitResult,
  LocalPackageUploadFinishRequest,
  LocalPackageUploadPreview,
  LocalPackageUploadProgress,
  LocalPackageUploadStartRequest,
  LocalPackageUploadStartResult,
} from './local-upload'
export type {
  EnvironmentChangeStatus,
  EnvironmentDependencySnapshot,
  EnvironmentSnapshotChange,
  EnvironmentSnapshotPreview,
  EnvironmentSnapshotSource,
  EnvironmentSnapshotSummary,
} from './environment'

const SELF_PACKAGE = 'koishi-plugin-market-next'

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
      marketData: MarketDataStore
    }
  }

  interface Events {
    'market/install'(deps: Dict<string>, forced?: boolean, options?: InstallOptions): Promise<number>
    'market/install-bundle'(request: BundleInstallRequest, forced?: boolean, options?: InstallOptions): Promise<BundleInstallResult>
    'market/install-fallback-candidate'(failedEndpoint?: string): Promise<InstallFallbackCandidate | undefined>
    'market/install-history'(limit?: number): Promise<InstallHistoryEntry[]>
    'market/install-history-detail'(id: string): Promise<InstallLogDetail | undefined>
    'market/local-package-upload-start'(request: LocalPackageUploadStartRequest): Promise<LocalPackageUploadStartResult>
    'market/local-package-upload-chunk'(request: LocalPackageUploadChunkRequest): Promise<LocalPackageUploadProgress>
    'market/local-package-upload-finish'(request: LocalPackageUploadFinishRequest): Promise<LocalPackageUploadPreview>
    'market/local-package-upload-commit'(uploadId: string): Promise<LocalPackageUploadCommitResult>
    'market/local-package-upload-cancel'(uploadId: string): Promise<boolean>
    'market/prepare-local-binding'(name: string): Promise<LocalBindingResult>
    'market/environment-snapshots'(): Promise<EnvironmentSnapshotSummary[]>
    'market/environment-snapshot-preview'(id: string): Promise<EnvironmentSnapshotPreview | undefined>
    'market/environment-snapshot-apply'(id: string, options?: InstallOptions): Promise<number>
    'market/remove-bundle-configs'(request: BundleConfigRemoveRequest): Promise<BundleConfigRemoveResult>
    'market/update-config'(patch: Partial<Config>): Promise<boolean>
    'market/update-data'(patch: Partial<MarketDataStorePayload>): Promise<MarketDataStorePayload>
    'market/refresh-dependencies'(): Promise<void>
    'market/package'(name: string): Promise<Registry>
    'market/registry'(names: string[]): Promise<Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>>
    'market/ensure-config'(name: string): Promise<boolean>
    'market/avatar'(key: string, url?: string): Promise<AvatarFetchResult | undefined>
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
- Koishi Registry GitHub Pages：https://koishijs.github.io/registry/index.json
- Koishi Registry GitHub Raw：https://raw.githubusercontent.com/koishijs/registry/release/index.json
- Koishi Registry jsDelivr：https://cdn.jsdelivr.net/gh/koishijs/registry@release/index.json
- Koishi Registry GitHub 代理：https://ghproxy.net/https://raw.githubusercontent.com/koishijs/registry/release/index.json
- Koishi Registry GitHub 代理 2：https://ghfast.top/https://raw.githubusercontent.com/koishijs/registry/release/index.json

要浏览更多社区镜像，请访问 [Koishi 论坛上的镜像一览](https://k.ilharp.cc/4000)。`

// ## 软件源（填入 npmRegistryServer）

// - 淘宝（大陆）：https://registry.npmmirror.com
// - 腾讯（大陆）：https://mirrors.cloud.tencent.com/npm
// - 华为云（大陆）：https://mirrors.huaweicloud.com/repository/npm
// - npm（全球）：https://registry.npmjs.org
// - cnpm：https://r.cnpmjs.org

export function apply(ctx: Context, config: Config = {}) {
  if (!ctx.loader?.writable) {
    return ctx.logger('app').warn('koishi-plugin-market-next is only available for json/yaml config file')
  }

  if (ensureMarketNextConfigDefaults(ctx, config)) {
    ctx.logger('market').info('normalized market-next display config in Koishi config')
    void ctx.loader.writeConfig(true)
      .then(() => ctx.get('console')?.refresh('config'))
      .catch(error => ctx.logger('market').warn(error))
  }

  applyChatLunaTool(ctx, config)

  let activeDataStore: MarketDataStore | undefined
  ctx.plugin(Installer, config.registry ?? {})

  ctx.inject(['installer'], (ctx) => {
    ctx.i18n.define('zh-CN', require('./locales/message.zh-CN'))
    ctx.i18n.define('en-US', require('./locales/message.en-US'))

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
      .option('force', '-f, --force')
      .action(async ({ session, options }, ...names) => {
        // refresh dependencies
        await ctx.installer.refresh(true, true)
        const deps = await ctx.installer.getDeps({ background: false })
        const requested = names.length
          ? names.map((name) => {
            const candidates = ctx.installer.resolveName(name)
            return candidates.find(candidate => deps[candidate])
          }).filter(Boolean)
          : Object.keys(deps)
        if (options.self && !requested.includes('koishi')) requested.push('koishi')

        const runtimeData = activeDataStore
          ? await activeDataStore.get()
          : await readMarketDataStore(ctx)
        const policy: UpdateIgnorePolicy = {
          updateIgnoredPackages: config.updateIgnoredPackages,
          updateIgnoreVersions: config.updateIgnoreVersions,
          updateIgnorePrerelease: config.updateIgnorePrerelease,
          updateIgnored: runtimeData.updateIgnored,
        }
        const now = Date.now()
        const updates = Array.from(new Set(requested)).flatMap((name) => {
          const dep = deps[name]
          if (!dep?.resolved || dep.local || dep.workspace || dep.invalid) return []
          const versions = Object.keys(ctx.installer.fullCache[name] ?? {})
          if (!versions.length && dep.latest) versions.push(dep.latest)
          const target = options.force
            ? getUpdateCandidates(versions, dep.resolved)[0]
            : getLatestAllowedUpdate(name, versions, dep.resolved, policy, now)
          return target ? [{ name, resolved: dep.resolved, target }] : []
        })
        if (!updates.length) return session.text('.all-updated')

        const output = updates.map(({ name, resolved, target }) => {
          return `${name}: ${resolved} -> ${target}`
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
        const installNames = updates.map(update => update.name)
        const installDeps = updates.reduce<Dict<string>>((result, update) => {
          result[update.name] = update.target
          return result
        }, {})
        try {
          const code = await ctx.installer.install(installDeps, undefined, () => ensurePluginConfigs(ctx, installNames))
          if (code) return session.text('.failed', [code])
          await ensurePluginConfigs(ctx, installNames)
        } finally {
          ctx.loader.envData.message = null
        }
        return session.text('.success')
      })

    ctx.command('plugin.clear-avatar-cache', { authority: 4 })
      .action(async ({ session }) => {
        const { memory, disk } = await clearAvatarCacheStorage(ctx)
        return session.text('.success', [memory, disk])
      })
  })

  ctx.inject(['console', 'installer', 'server'], (ctx) => {
    ctx.plugin(DependencyProvider)
    ctx.plugin(RegistryProvider)
    ctx.plugin(RegistryStatusProvider)
    const dataStore = new MarketDataStore(ctx)
    activeDataStore = dataStore
    ctx.effect(() => () => {
      if (activeDataStore === dataStore) activeDataStore = undefined
    })
    ctx.plugin(MarketProvider, config.search ?? {})
    setupIdleProbe(ctx, config)

    ctx.console.addEntry({
      dev: resolve(__dirname, '../../client/index.ts'),
      prod: resolve(__dirname, '../../dist'),
    })

    const uiPath = String((ctx.console as any).config?.uiPath ?? '').replace(/\/+$/, '')
    const marketSnapshotRoute = `${uiPath}/market-next/snapshot`
    const marketSnapshotTransport = new MarketSnapshotTransport(ctx, marketSnapshotRoute)
    const server = (ctx as Context & { server: any }).server
    server.get(`${marketSnapshotRoute}/:id`, (koa: any) => {
      const entry = marketSnapshotTransport.get(koa.params.id)
      if (!entry) {
        koa.status = 404
        koa.body = 'market snapshot not found'
        return
      }
      koa.type = 'application/json'
      koa.set('Content-Encoding', 'gzip')
      koa.set('Cache-Control', 'public, max-age=31536000, immutable')
      koa.set('ETag', `"${entry.id}"`)
      koa.set('X-Content-Type-Options', 'nosniff')
      koa.body = entry.body
    })
    ctx.effect(() => () => marketSnapshotTransport.clear())

    setupConsoleListeners(ctx, config, dataStore, marketSnapshotTransport)

    ctx.on('ready', () => {
      void dataStore.migrateFromConfig(config)
        .then(() => {
          if (!removeLegacyCollapsedGroupsConfig(ctx, config)) return
          return ctx.loader.writeConfig(true)
            .then(() => ctx.get('console')?.refresh('config'))
        })
        .catch(error => ctx.logger('market').warn(`failed to migrate market-next data: ${error instanceof Error ? error.message : error}`))
      const timer = setTimeout(() => {
        if (!ctx.scope.isActive) return
        ctx.logger('market').debug('schedule installed plugin config repair after market-next ready')
        void ensureInstalledPluginConfigs(ctx).catch(error => ctx.logger('market').warn(error))
      }, 1000)
      const stopAvatarMaintenance = startAvatarCacheMaintenance(ctx)
      ctx.effect(() => () => {
        clearTimeout(timer)
        stopAvatarMaintenance()
      })
    })
  })
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

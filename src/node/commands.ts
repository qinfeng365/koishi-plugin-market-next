import { Context, Dict, pick } from 'koishi'
import { clearAvatarCacheStorage } from './avatar'
import type { Config } from './config'
import { MarketDataStore, readMarketDataStore } from './data'
import { ensurePluginConfigs } from './plugin-config'
import {
  getLatestAllowedUpdate,
  getUpdateCandidates,
  type UpdateIgnorePolicy,
} from '../shared/update'

export function setupCommands(
  ctx: Context,
  config: Config,
  getActiveDataStore: () => MarketDataStore | undefined,
) {
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
      try {
        await ctx.installer.install(result, undefined, () => ensurePluginConfigs(ctx, Object.keys(result)))
        await ensurePluginConfigs(ctx, Object.keys(result))
        return session.text('.success')
      } finally {
        ctx.loader.envData.message = null
      }
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

      const activeDataStore = getActiveDataStore()
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
}

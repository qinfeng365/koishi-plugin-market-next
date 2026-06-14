import { defineComponent, h, ref, watch } from 'vue'
import { Context, Dict, global, message, receive, router, Schema, send, store, useConfig } from '@koishijs/client'
import type { PluginBundleRecord, RegistryStatus } from 'koishi-plugin-market-next'
import type { IgnoredUpdates } from './utils'
import { showConfirm, showManual } from './components/utils'
import extensions from './extensions'
import Dependencies from './components/dependencies.vue'
import Install from './components/install.vue'
import BundleInstall from './components/bundle-install.vue'
import Confirm from './components/confirm.vue'
import InstallProgress from './components/install-progress.vue'
import Market from './components/market.vue'
import Progress from './components/progress.vue'
import './icons'
import './styles/scrollbars.scss'

import 'virtual:uno.css'

declare module '@koishijs/client' {
  interface Config {
    market: MarketConfig
  }
}

interface MarketConfig {
  bulkMode?: boolean
  removeConfig?: boolean
  override?: Dict<string>
  collapsedGroups?: Dict<boolean>
  updateIgnored?: IgnoredUpdates
  updateIgnoredPackages?: string
  updateIgnoreDuration?: number
  updateIgnoreVersions?: number
  updateIgnorePrerelease?: boolean
  idleProbe?: boolean
  idleProbeDelay?: number
  idleProbeBootDelay?: number
  idleProbeInterval?: number
  bundleRecords?: Dict<PluginBundleRecord>
  gravatar?: string
  search?: {
    endpoint?: string
    timeout?: number
    autoRoute?: boolean
    logLevel?: string
  }
}

type MarketStore = typeof store & {
  registryStatus?: Dict<RegistryStatus>
}

const REGISTRY_STATUS_TIMEOUT = 120000
const REGISTRY_STATUS_SWEEP_INTERVAL = 15000
const REGISTRY_STATUS_TIMEOUT_TEXT = 'npm 元数据请求长时间未完成，请刷新依赖版本后重试。'

function sweepRegistryStatus(target: MarketStore = store as MarketStore) {
  const now = Date.now()
  const next = { ...target.registryStatus }
  let changed = false
  for (const [name, status] of Object.entries(next)) {
    if (!status?.loading) continue
    if (status.updatedAt && now - status.updatedAt <= REGISTRY_STATUS_TIMEOUT) continue
    next[name] = {
      ...status,
      loading: false,
      reason: 'timeout',
      error: REGISTRY_STATUS_TIMEOUT_TEXT,
    }
    changed = true
  }
  if (changed) target.registryStatus = next
  return changed
}

receive('market/patch', (data) => {
  store.market = {
    ...data,
    data: {
      ...store.market?.data,
      ...data.data,
    },
  }
})

receive('market/registry', (data) => {
  store.registry = {
    ...store.registry,
    ...data,
  }
})

receive('market/registry-status', (data: Dict<RegistryStatus>) => {
  const target = store as MarketStore
  const next = { ...target.registryStatus }
  for (const [name, status] of Object.entries(data)) {
    if (!status) continue
    next[name] = status
  }
  target.registryStatus = {
    ...next,
  }
  sweepRegistryStatus(target)
})

receive('market/registry-status/clear', () => {
  const target = store as MarketStore
  target.registryStatus = {}
})

export default (ctx: Context) => {
  ctx.plugin(extensions)

  ctx.effect(() => {
    const timer = window.setInterval(() => sweepRegistryStatus(), REGISTRY_STATUS_SWEEP_INTERVAL)
    return () => window.clearInterval(timer)
  })

  ctx.slot({
    type: 'welcome-choice',
    component: defineComponent(() => () => h('div', {
      class: 'choice',
      onClick: () => router.push('/market'),
    }, [
      h('h2', '浏览插件'),
      h('p', '浏览插件市场中的插件，并根据自己的需要安装和配置。'),
    ])),
  })

  ctx.slot({
    type: 'global',
    component: Install,
  })

  ctx.slot({
    type: 'global',
    component: BundleInstall,
  })

  ctx.slot({
    type: 'global',
    component: Confirm,
  })

  ctx.slot({
    type: 'global',
    component: InstallProgress,
  })

  ctx.page({
    id: 'market',
    path: '/market',
    name: '插件市场',
    icon: 'activity:market',
    order: 750,
    authority: 4,
    fields: ['config'],
    component: Market,
  })

  ctx.settings({
    id: 'market',
    title: '插件市场设置',
    schema: Schema.object({
      market: Schema.object({
        bulkMode: Schema.boolean().default(false).hidden().description('批量操作模式。'),
        removeConfig: Schema.union([
          Schema.const(undefined).description('每次询问'),
          Schema.const(true).description('总是'),
          Schema.const(false).description('从不'),
        ]).hidden().description('移除插件时是否移除其已经存在的配置。'),
        updateIgnoredPackages: Schema.string().role('textarea').hidden().description('不检测更新的依赖名。每行或用逗号分隔一个包名。'),
        updateIgnoreDuration: Schema.number().role('time').default(0).hidden().description('点击“忽略此次更新”后的默认忽略时长。0 表示不按时间过期。'),
        updateIgnoreVersions: Schema.number().min(1).max(20).step(1).default(1).hidden().description('点击“忽略此次更新”后连续忽略几个新版本。1 表示只忽略当前最新版本。'),
        updateIgnorePrerelease: Schema.boolean().default(false).hidden().description('手动开启后，alpha / beta / rc 等预发布版本不会被视为可更新版本。'),
        idleProbe: Schema.boolean().default(true).description('Console 空闲时自动探测依赖版本和插件市场数据。'),
        idleProbeDelay: Schema.number().role('time').default(300000).description('Console 无人在线多久后开始后台探测。'),
        idleProbeBootDelay: Schema.number().role('time').default(60000).description('Koishi 启动或重载后，至少等待多久才允许空闲探测。'),
        idleProbeInterval: Schema.number().role('time').default(21600000).description('两次空闲后台探测之间的最小间隔。'),
        override: Schema.dict(String).hidden(),
        collapsedGroups: Schema.dict(Boolean).hidden(),
        updateIgnored: Schema.dict(Schema.any()).hidden(),
        bundleRecords: Schema.dict(Schema.any()).hidden(),
        gravatar: Schema.string().description('Gravatar 镜像地址。'),
      }),
    }),
  })

  const config = useConfig()
  const refreshingMarket = ref(false)
  const refreshingDependencies = ref(false)
  const pendingMarketRefreshFeedback = ref(false)

  function finishMarketRefreshFeedback() {
    if (!pendingMarketRefreshFeedback.value) return
    pendingMarketRefreshFeedback.value = false
    if (store.market?.stale || store.market?.error) {
      message.error('插件市场刷新失败，已保留可用数据。')
    } else {
      message.success('插件市场刷新成功。')
    }
  }

  if (!global.static) {
    ctx.slot({
      type: 'status-right',
      component: Progress,
      order: 10,
    })

    ctx.page({
      id: 'dependencies',
      path: '/dependencies',
      name: '依赖管理',
      icon: 'activity:deps',
      order: 700,
      authority: 4,
      fields: ['config', 'dependencies', 'packages', 'registry', 'registryStatus'],
      component: Dependencies,
    })
  }

  ctx.action('market.refresh', {
    shortcut: 'ctrl+r',
    disabled: () => !['market', 'dependencies'].includes(router.currentRoute.value?.meta?.activity.id),
    async action() {
      const activity = router.currentRoute.value?.meta?.activity.id
      const dependencies = activity === 'dependencies'
      const refreshing = dependencies ? refreshingDependencies : refreshingMarket
      if (refreshing.value) return
      refreshing.value = true
      if (!dependencies) pendingMarketRefreshFeedback.value = true
      try {
        await send(dependencies ? 'market/refresh-dependencies' : 'market/refresh')
        if (dependencies) {
          message.success('依赖版本刷新已开始。')
        } else {
          message.success('插件市场刷新请求已提交。')
          setTimeout(() => {
            if (!store.market?.refreshing) finishMarketRefreshFeedback()
          }, 300)
        }
      } catch (error) {
        if (!dependencies) pendingMarketRefreshFeedback.value = false
        console.error(error)
        message.error('刷新失败，请检查网络或日志。')
      } finally {
        refreshing.value = false
      }
    },
  })

  ctx.action('market.install', {
    disabled: () => !Object.keys(config.value.market?.override ?? {}).length,
    action() {
      showConfirm.value = true
    },
  })

  ctx.action('dependencies.manual', {
    action() {
      showManual.value = true
    },
  })

  ctx.menu('market', [{
    id: '.install',
    icon: 'check',
    label: '应用更改',
  }, {
    id: '.refresh',
    icon: 'refresh',
    label: '刷新',
    type: () => refreshingMarket.value || !store.market || store.market.refreshing || store.market.progress < store.market.total ? 'spin disabled' : '',
  }])

  const registryRefreshing = () => {
    const target = store as MarketStore
    return Object.values(target.registryStatus ?? {}).some(status => status.loading)
  }

  ctx.menu('dependencies', [{
    id: '.upgrade',
    icon: 'rocket',
    label: '全部更新',
  }, {
    id: 'market.install',
    icon: 'check',
    label: '应用更改',
  }, {
    id: '.manual',
    icon: 'add',
    label: '手动添加',
  }, {
    id: 'market.refresh',
    icon: 'refresh',
    label: '刷新',
    type: () => refreshingDependencies.value || registryRefreshing() ? 'spin disabled' : '',
  }])

  ctx.effect(() => {
    return watch(() => store.dependencies, (value) => {
      if (!value || !config.value.market) return
      for (const key in config.value.market.override) {
        if (value[key]?.workspace) {
          delete config.value.market.override[key]
        } else if (!config.value.market.override[key] && !value[key]) {
          // package to be removed has been removed
          delete config.value.market.override[key]
        } else if (value[key]?.request === config.value.market.override[key]) {
          // package has been installed to the right version
          delete config.value.market.override[key]
        }
      }
    }, { immediate: true })
  })

  ctx.effect(() => {
    return watch(() => store.market?.refreshing, (refreshing, previous) => {
      if (!pendingMarketRefreshFeedback.value || refreshing || previous !== true) return
      finishMarketRefreshFeedback()
    })
  })
}

import { defineComponent, h, ref, watch } from 'vue'
import { Context, Dict, global, message, receive, router, send, store, useConfig } from '@koishijs/client'
import type { PluginBundleRecord, RegistryStatus } from 'koishi-plugin-market-next'
import { getPendingOverrides, patchMarketNextData, type IgnoredUpdates } from './utils'
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
  interface Store {
    marketData?: {
      override?: Dict<string>
      updateIgnored?: IgnoredUpdates
      bundleRecords?: Dict<PluginBundleRecord>
    }
  }
}

interface MarketConfig {
  bulkMode?: boolean
  removeConfig?: boolean
  collapsedGroups?: Dict<boolean>
  updateIgnoredPackages?: string
  updateIgnoreDuration?: number
  updateIgnoreVersions?: number
  updateIgnorePrerelease?: boolean
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
    component: Market,
  })

  try {
    extensions(ctx)
  } catch (error) {
    console.warn('[market-next] failed to initialize console extensions', error)
  }

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
      fields: ['dependencies', 'registry'],
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
    disabled: () => !Object.keys(getPendingOverrides()).length,
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
      if (!value) return
      const overrides = getPendingOverrides()
      for (const key in overrides) {
        if (value[key]?.workspace) {
          delete overrides[key]
        } else if (!overrides[key] && !value[key]) {
          // package to be removed has been removed
          delete overrides[key]
        } else if (value[key]?.request === overrides[key]) {
          // package has been installed to the right version
          delete overrides[key]
        }
      }
      void patchMarketNextData({ override: { ...overrides } })
    }, { immediate: true })
  })

  ctx.effect(() => {
    return watch(() => store.market?.refreshing, (refreshing, previous) => {
      if (!pendingMarketRefreshFeedback.value || refreshing || previous !== true) return
      finishMarketRefreshFeedback()
    })
  })
}

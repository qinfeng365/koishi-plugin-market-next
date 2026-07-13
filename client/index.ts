import { defineComponent, h, ref, watch } from 'vue'
import { Context, Dict, global, message, receive, router, send, store, useConfig } from '@koishijs/client'
import type { PluginBundleRecord, RegistryStatus } from 'koishi-plugin-market-next'
import { getPendingOverrides, patchMarketNextData, type IgnoredUpdates } from './utils'
import { registerMarketNextI18n, translate } from './i18n'
import { showConfirm, showEnvironmentVersions, showInstallHistory, showManual } from './components/utils'
import extensions from './extensions'
import Dependencies from './components/dependencies.vue'
import Install from './components/install.vue'
import BundleInstall from './components/bundle-install.vue'
import Confirm from './components/confirm.vue'
import InstallProgress from './components/install-progress.vue'
import InstallHistory from './components/install-history.vue'
import EnvironmentVersions from './components/environment-versions.vue'
import Market from './components/market.vue'
import Progress from './components/progress.vue'
import './icons'
import './styles/scrollbars.scss'
import './styles/version-select.scss'

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
      collapsedGroups?: Dict<boolean>
    }
  }
}

interface MarketConfig {
  bulkMode?: boolean
  removeConfig?: boolean
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
const APRIL_FOOLS_SHORTCUT_TIMEOUT = 1500

function isAprilFoolsDay(date = new Date()) {
  return date.getMonth() === 3 && date.getDate() === 1
}

function isKoishiDay(date = new Date()) {
  return date.getMonth() === 4 && date.getDate() === 14
}

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
      error: translate('common.messages.metadataTimeout'),
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
  registerMarketNextI18n(ctx)

  const aprilFoolsIcon = ref(isAprilFoolsDay())
  const koishiDayIcon = ref(isKoishiDay())
  const forcedAprilFoolsIcon = ref(false)
  let aprilFoolsShortcutAt = 0

  ctx.effect(() => {
    const updateSeasonalIcon = () => {
      aprilFoolsIcon.value = isAprilFoolsDay()
      koishiDayIcon.value = isKoishiDay()
    }
    const onAprilFoolsShortcut = (event: KeyboardEvent) => {
      if (router.currentRoute.value?.path !== '/dependencies') return
      if (event.repeat || event.isComposing) return
      const key = event.key.toLowerCase()
      if (!event.altKey || event.ctrlKey || event.metaKey) {
        if (key !== 'alt') aprilFoolsShortcutAt = 0
        return
      }
      if (key === 'g') {
        aprilFoolsShortcutAt = Date.now()
        event.preventDefault()
        return
      }
      if (key === 'b' && aprilFoolsShortcutAt && Date.now() - aprilFoolsShortcutAt <= APRIL_FOOLS_SHORTCUT_TIMEOUT) {
        forcedAprilFoolsIcon.value = true
        aprilFoolsShortcutAt = 0
        event.preventDefault()
        return
      }
      aprilFoolsShortcutAt = 0
    }
    const timer = window.setInterval(updateSeasonalIcon, 60_000)
    window.addEventListener('keydown', onAprilFoolsShortcut)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('keydown', onAprilFoolsShortcut)
    }
  })

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
      h('h2', translate('common.welcome.marketTitle')),
      h('p', translate('common.welcome.marketDescription')),
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

  ctx.slot({
    type: 'global',
    component: InstallHistory,
  })

  ctx.slot({
    type: 'global',
    component: EnvironmentVersions,
  })

  ctx.page({
    id: 'market',
    path: '/market',
    name: () => translate('common.pages.market'),
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
      message.error(translate('common.messages.refreshMarketFailed'))
    } else {
      message.success(translate('common.messages.refreshMarketSuccess'))
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
      name: () => translate('common.pages.dependencies'),
      icon: 'activity:deps',
      order: 700,
      authority: 4,
      fields: ['dependencies', 'registry', 'registryStatus'],
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
          message.success(translate('common.messages.refreshDependenciesStarted'))
        } else {
          message.success(translate('common.messages.refreshMarketSubmitted'))
          setTimeout(() => {
            if (!store.market?.refreshing) finishMarketRefreshFeedback()
          }, 300)
        }
      } catch (error) {
        if (!dependencies) pendingMarketRefreshFeedback.value = false
        console.error(error)
        message.error(translate('common.messages.refreshFailed'))
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

  ctx.action('dependencies.history', {
    action() {
      showInstallHistory.value = true
    },
  })

  ctx.action('dependencies.versions', {
    action() {
      showEnvironmentVersions.value = true
    },
  })

  ctx.menu('market', [{
    id: '.install',
    icon: 'check',
    label: () => translate('common.actions.apply'),
  }, {
    id: '.refresh',
    icon: 'refresh',
    label: () => translate('common.actions.refresh'),
    type: () => refreshingMarket.value || !store.market || store.market.refreshing || store.market.progress < store.market.total ? 'spin disabled' : '',
  }])

  const registryRefreshing = () => {
    const target = store as MarketStore
    return Object.values(target.registryStatus ?? {}).some(status => status.loading)
  }

  ctx.menu('dependencies', [{
    id: '.upgrade',
    icon: () => {
      if (aprilFoolsIcon.value || forcedAprilFoolsIcon.value) return 'bomb'
      if (koishiDayIcon.value) return 'koishi'
      return 'rocket'
    },
    label: () => translate('common.actions.upgradeAll'),
  }, {
    id: 'market.install',
    icon: 'check',
    label: () => translate('common.actions.apply'),
  }, {
    id: '.manual',
    icon: 'add',
    label: () => translate('common.actions.manual'),
  }, {
    id: '.history',
    icon: 'info-full',
    label: () => translate('common.actions.history'),
  }, {
    id: '.versions',
    icon: 'file-archive',
    label: () => translate('common.actions.versionManagement'),
  }, {
    id: 'market.refresh',
    icon: 'refresh',
    label: () => translate('common.actions.refresh'),
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

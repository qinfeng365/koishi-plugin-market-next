import { ref, watch } from 'vue'
import { Context, message, router, send, store } from '@koishijs/client'
import { getPendingOverrides, patchMarketNextData } from './utils'
import { translate } from './i18n'
import { showConfirm, showEnvironmentVersions, showInstallHistory, showManual } from './components/utils'
import {
  REGISTRY_STATUS_SWEEP_INTERVAL,
  sweepRegistryStatus,
  type MarketStore,
} from './registry-state'

const APRIL_FOOLS_SHORTCUT_TIMEOUT = 1_500

function isAprilFoolsDay(date = new Date()) {
  return date.getMonth() === 3 && date.getDate() === 1
}

function isKoishiDay(date = new Date()) {
  return date.getMonth() === 4 && date.getDate() === 14
}

export function setupActions(ctx: Context) {
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
        if (!overrides[key] && !value[key]) {
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

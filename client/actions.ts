import { computed, ref, watch } from 'vue'
import { Context, message, router, send, store } from '@koishijs/client'
import { getLatestVersion, getMarketNextConfig, getMarketNextPolicy, getPendingOverrides, hasUpdate, patchMarketNextData } from './utils'
import { translate } from './i18n'
import { activeBundle, configuredPlugins, dependencyDialog, findBundleRecord, getConfigWriter, getRegistryStatus, installProgressState, showConfirm, showEnvironmentVersions, showInstallHistory, showManual } from './components/utils'
import { getPluginShortname, PLUGIN_PACKAGE_RE } from '../src/shared/bundle'
import {
  isRegistryRefreshing,
  REGISTRY_STATUS_SWEEP_INTERVAL,
  sweepRegistryStatus,
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
      const coupled = getMarketNextConfig()?.coupleRefresh === true
      const market = !dependencies || coupled
      const deps = dependencies || coupled
      if (market && refreshingMarket.value || deps && refreshingDependencies.value) return
      if (market) {
        refreshingMarket.value = true
        pendingMarketRefreshFeedback.value = true
      }
      if (deps) refreshingDependencies.value = true
      try {
        const events: Array<'market/refresh' | 'market/refresh-dependencies'> = coupled
          ? ['market/refresh', 'market/refresh-dependencies']
          : [dependencies ? 'market/refresh-dependencies' : 'market/refresh']
        const results = await Promise.allSettled(events.map(async (event) => {
          // Undefined while disconnected, when nothing was sent.
          const task = send(event)
          if (!task) throw new Error('disconnected')
          await task
          // Close stale dependency choices after their reset, even if the market request fails.
          // Keep manual uploads and dialogs behind an active install or fallback retry intact.
          if (event === 'market/refresh-dependencies' && !installProgressState.visible) {
            activeBundle.value = undefined
            showConfirm.value = false
            if (dependencyDialog.type === 'ignore') dependencyDialog.type = undefined
          }
        }))
        const failed = results.find(result => result.status === 'rejected')
        if (failed?.status === 'rejected') throw failed.reason
        if (coupled) {
          message.success(translate('common.messages.refreshBothStarted'))
        } else if (dependencies) {
          message.success(translate('common.messages.refreshDependenciesStarted'))
        } else {
          message.success(translate('common.messages.refreshMarketSubmitted'))
        }
        if (market) {
          setTimeout(() => {
            if (!store.market?.refreshing) finishMarketRefreshFeedback()
          }, 300)
        }
      } catch (error) {
        if (market) pendingMarketRefreshFeedback.value = false
        console.error(error)
        message.error(translate('common.messages.refreshFailed'))
      } finally {
        if (market) refreshingMarket.value = false
        if (deps) refreshingDependencies.value = false
      }
    },
  })

  ctx.action('market.install', {
    disabled: () => !Object.keys(getPendingOverrides()).length,
    action() {
      showConfirm.value = true
    },
  })

  const updates = computed(() => {
    const policy = getMarketNextPolicy()
    const pending = new Set(Object.keys(getPendingOverrides()))
    const writer = getConfigWriter(ctx)
    return Object.keys(store.dependencies ?? {}).filter((name) => {
      const dep = store.dependencies[name]
      if (pending.has(name)
        || dep.local || dep.workspace || dep.invalid || findBundleRecord(name)
        || getRegistryStatus(name)?.error) return false
      if (writer && store.packages?.[name] && PLUGIN_PACKAGE_RE.test(name)
        && !configuredPlugins.value.has(getPluginShortname(name))) return false
      return !!hasUpdate(name, policy)
    })
  })

  ctx.action('dependencies.upgrade', {
    disabled: () => !updates.value.length,
    async action() {
      const policy = getMarketNextPolicy()
      for (const name of updates.value) {
        const version = getLatestVersion(name, policy)
        if (version) getPendingOverrides()[name] = version
      }
      void patchMarketNextData({ override: { ...getPendingOverrides() } })
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
    icon: 'clipboard-list',
    label: () => translate('common.actions.history'),
  }, {
    id: '.versions',
    icon: 'market-next:versions',
    label: () => translate('common.actions.versionManagement'),
  }, {
    id: 'market.refresh',
    icon: 'refresh',
    label: () => translate('common.actions.refresh'),
    type: () => refreshingDependencies.value || isRegistryRefreshing() ? 'spin disabled' : '',
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

import { computed, ref, watch, reactive } from 'vue'
import { Dict, global, message, send, store, useContext, useConfig } from '@koishijs/client'
import { analyzeVersions, ensureInstalledConfig, findBundleRecord, getConfigWriter, getRegistryStatus, getRegistryStatusText, install, PeerInfo, ResultType } from '../components/utils'
import { active, getBulkMode, getPendingOverrides, getRemoveConfig, getWritableBundleRecords, patchMarketNextConfig, patchMarketNextData } from '../utils'
import { parse } from 'semver'
import { isBundlePackageName } from '../../src/shared/bundle'
import { isLocalDependency } from '../../src/shared/dependency-source'
import { useMarketNextI18n } from '../i18n'
import { getMarketObject } from '../market/state'

export function useInstall() {
  const ctx = useContext()
  const config = useConfig()
  const { t } = useMarketNextI18n()

  const saveChoice = ref(false)
  const showRemoveDialog = ref(false)
  const showBundleUninstallDialog = ref(false)
  const bundleUninstallTarget = ref('')

  const bulkMode = computed({
    get: () => getBulkMode(),
    set: (value: boolean) => {
      void patchMarketNextData({ bulkMode: value })
    },
  })

  function installDep(version: string, checkConfig = false, removeConfig = false) {
    const target = active.value
    if (!target) return

    // workspace packages don't need to be installed
    if (bulkMode.value && !workspace.value) {
      const override = getPendingOverrides()
      if (dep.value?.resolved === version || !version && !dep.value) {
        delete override[target]
      } else {
        override[target] = version
      }
      void patchMarketNextData({ override: { ...override } })
      active.value = ''
      return
    }

    // 1. The plugin is to be removed.
    // 2. The plugin has config entries.
    // 3. `removeConfig` is not set.
    if (checkConfig && getConfigWriter(ctx)?.get(target)?.length) {
      const savedRemoveConfig = getRemoveConfig(config.value)
      if (typeof savedRemoveConfig !== 'boolean') {
        showRemoveDialog.value = true
        return
      } else {
        removeConfig = savedRemoveConfig
      }
    }

    if (saveChoice.value) {
      if (config.value.market) config.value.market.removeConfig = removeConfig
      void patchMarketNextConfig({ removeConfig })
    }
    saveChoice.value = false
    showRemoveDialog.value = false

    versions[target] = version
    return install(versions, async () => {
      if (workspace.value) return
      if (version) {
        for (const key in versions) {
          await ensureInstalledConfig(ctx, key, key !== target)
        }
      } else if (removeConfig) {
        getConfigWriter(ctx)?.remove(target)
      }
      if (!version) {
        const records = getWritableBundleRecords(config.value)
        delete records[target]
        const saved = await patchMarketNextData({ bundleRecords: records })
        if (!saved) message.warning(t('operations.confirm.saveBundleFailed'))
      }
    })
  }

  const version = computed({
    get: () => versions[active.value],
    set: (value) => versions[active.value] = value,
  })

  const selectVersion = computed({
    get: () => version.value,
    set(value) {
      version.value = value
    },
  })

  const versions = reactive<Dict<string>>({})

  function getOverride() {
    return bulkMode.value ? getPendingOverrides() : versions
  }

  function getVersion(name: string) {
    const override = getOverride()
    return override[name]
  }

  function setVersion(name: string, version: string) {
    const override = getOverride()
    if (version) {
      override[name] = version
    } else {
      delete override[name]
    }
  }

  function shouldShowPeerVersionSelect(peer: PeerInfo, name: string) {
    if (!store.registry?.[name] || isLocalPackageSelection(name)) return false
    if (name in getOverride()) return true
    return peer.result === 'danger'
  }

  function getPeerResolvedVersion(peer: PeerInfo, name: string) {
    return getVersion(name)
      || getWorkspaceVersion(name)
      || peer.resolved
      || store.dependencies?.[name]?.resolved
      || store.packages?.[name]?.package.version
  }

  const unchanged = computed(() => {
    return !data.value?.[version.value]
      || version.value === store.dependencies?.[active.value]?.request && !!store.dependencies?.[active.value]?.resolved
  })

  const dep = computed(() => store.dependencies?.[active.value])
  const current = computed(() => store.dependencies?.[active.value]?.resolved)
  const local = computed(() => store.packages?.[active.value])
  const bundleUninstallRecord = computed(() => {
    const target = bundleUninstallTarget.value
    if (!target || !isBundlePackageName(target)) return
    return findBundleRecord(target)
  })

  const showRemoveButton = computed(() => {
    return current.value || store.dependencies?.[active.value] || bulkMode.value && getPendingOverrides()[active.value]
  })

  const workspace = computed(() => getWorkspaceVersion(active.value))
  const localSelection = computed(() => isLocalPackageSelection(active.value))

  function isLocalPackageSelection(name: string) {
    if (!name) return false
    const dependency = store.dependencies?.[name]
    return isLocalDependency(dependency)
      || !!getWorkspaceVersion(name)
      || !dependency && !!store.packages?.[name]
  }

  function requestRemove() {
    const target = active.value
    const record = target && findBundleRecord(target)
    if (target && record) {
      bundleUninstallTarget.value = target
      active.value = ''
      showBundleUninstallDialog.value = true
      return
    }
    installDep('', true)
  }

  function getWorkspaceVersion(name: string) {
    // workspace plugins:     dependencies ? packages √
    // workspace non-plugins: dependencies √ packages ×
    if (store.dependencies?.[name]?.workspace) {
      return store.dependencies?.[name]?.resolved
    }
    if (store.packages?.[name]?.workspace) {
      return store.packages?.[name]?.package.version
    }
  }

  const data = computed(() => {
    if (!active.value || localSelection.value) return
    return analyzeVersions(active.value, getVersion)
  })

  const registryStatus = computed(() => getRegistryStatus(active.value))

  const registryStatusText = computed(() => getRegistryStatusText(active.value))

  const danger = computed(() => {
    if (localSelection.value) return
    const deprecated = store.registry?.[active.value]?.[version.value]?.deprecated
    if (deprecated) return t('operations.install.deprecated', { reason: deprecated })
    if (getMarketObject(active.value)?.insecure) {
      return t('operations.install.insecure')
    }
  })

  const warning = computed(() => {
    if (!version.value || !current.value || localSelection.value) return
    try {
      const source = parse(current.value)
      const target = parse(version.value)
      if (source.major !== target.major || !source.major && source.minor !== target.minor) {
        return t('operations.install.majorWarning')
      }
    } catch {}
  })

  const result = computed(() => {
    if (!version.value || !data.value?.[version.value]) return
    const { result } = data.value[version.value]
    if (result === 'danger' || danger.value) return 'danger'
    if (result === 'warning' || warning.value) return 'warning'
    return result
  })

  function shouldFetchRegistry(name: string) {
    return !store.registry?.[name]
      && !isLocalPackageSelection(name)
      && !getRegistryStatus(name)?.loading
  }

  watch(() => [active.value, version.value, data.value?.[version.value]?.peers] as const, async ([target, selected, peers], _, onCleanup) => {
    let cancelled = false
    onCleanup(() => cancelled = true)
    if (!peers) return
    const names = Object.keys(peers).filter(shouldFetchRegistry)
    let registry: typeof store.registry = {}
    if (names.length) {
      try {
        registry = await send('market/registry', names) ?? {}
      } catch (error) {
        console.error(error)
      }
    }
    if (cancelled || active.value !== target || version.value !== selected) return
    Object.assign(registry, store.registry)
    if (bulkMode.value) return

    // rebuild versions
    for (const name of Object.keys(versions)) {
      if (name === target) continue
      if (name in peers) continue
      delete versions[name]
    }
    for (const name in peers) {
      if (!registry[name]) continue
      const { result } = peers[name]
      if (result !== 'warning' && result !== 'danger') continue
      versions[name] = Object.keys(registry[name])[0]
    }
  })

  watch(active, async (name, _, onCleanup) => {
    let cancelled = false
    onCleanup(() => cancelled = true)
    if (!name) return

    const selected = version.value = getPendingOverrides()[name]
      || store.dependencies?.[name]?.request
      || Object.keys(store.registry?.[name] || {})[0]

    if (shouldFetchRegistry(name)) {
      try {
        const registry = await send('market/registry', [name])
        if (cancelled || active.value !== name || version.value !== selected) return
        const versions = registry?.[name] || store.registry?.[name]
        if (versions) version.value = Object.keys(versions)[0]
      } catch (error) {
        console.error(error)
      }
    }
  }, { immediate: true })

  function configure() {
    getConfigWriter(ctx)?.ensure(active.value)
    closePanel()
  }

  function closePanel() {
    active.value = ''
  }

  function getResultIcon(type: ResultType) {
    switch (type) {
      case 'primary': return 'info-full'
      case 'warning': return 'exclamation-full'
      case 'danger': return 'times-full'
      case 'success': return 'check-full'
    }
  }

  function getResultText(peer: PeerInfo, name: string) {
    const isOverriden = name in getOverride()
    const isInstalled = store.packages ? !!store.packages[name] : !!store.dependencies?.[name]
    switch (peer.result) {
      case 'primary': return isOverriden ? t('operations.install.waitingRemove') : t('operations.install.optional')
      case 'danger': return peer.resolved ? t('operations.install.incompatible') : isOverriden ? t('operations.install.waitingRemove') : t('operations.install.notDownloaded')
      case 'success': return isOverriden ? isInstalled ? t('operations.install.waitingUpdate') : t('operations.install.waitingInstall') : t('operations.install.downloaded')
    }
  }

  return { t, global, store, active, saveChoice, showRemoveDialog, showBundleUninstallDialog, bundleUninstallTarget, bulkMode, installDep, selectVersion, current, danger, warning, data, registryStatus, registryStatusText, version, shouldShowPeerVersionSelect, getVersion, setVersion, getWorkspaceVersion, getPeerResolvedVersion, getResultIcon, getResultText, local, configure, localSelection, showRemoveButton, workspace, requestRemove, unchanged, result, bundleUninstallRecord, closePanel }
}

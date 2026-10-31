import { computed, ref } from 'vue'
import { message, send, store, useContext, useConfig } from '@koishijs/client'
import { ensureInstalledConfigs, getConfigWriter, showConfirm, install, pendingBundleUninstalls, MARKET_NEXT_PACKAGE } from '../components/utils'
import { getPendingOverrides, getRemoveConfig, getWritableBundleRecords, patchMarketNextData } from '../utils'
import { useMarketNextI18n } from '../i18n'

export function useConfirm() {
  const ctx = useContext()
  const config = useConfig()
  const { t } = useMarketNextI18n()
  const overrides = computed(() => getPendingOverrides())

  const removeConfig = ref(getRemoveConfig(config.value))

  const hasRemove = computed(() => {
    return Object.values(overrides.value).some(version => !version)
  })

  function confirm() {
    showConfirm.value = false
    const override = { ...overrides.value }
    const selfUpdate = Object.prototype.hasOwnProperty.call(override, MARKET_NEXT_PACKAGE)
    const removed = Object.entries(override)
      .filter(([, value]) => !value)
      .map(([name]) => name)
    const bundleRemovals = Object.fromEntries(Object.entries(pendingBundleUninstalls.value)
      .filter(([name]) => removed.includes(name)))
    const bundlePackages = new Set(Object.keys(bundleRemovals))
    const bundleMembers = new Set(Object.values(bundleRemovals)
      .flatMap(item => item.members ?? []))
    return install(override, async () => {
      const installNames = Object.entries(override)
        .filter(([, value]) => value)
        .map(([name]) => name)
        .filter(name => name !== MARKET_NEXT_PACKAGE)
      await ensureInstalledConfigs(ctx, installNames, true)
      for (const [name, item] of Object.entries(bundleRemovals)) {
        if (!item.cleanup) continue
        await send('market/remove-bundle-configs', {
          package: name,
          members: item.configs,
          removeEmptyGroup: true,
        })
      }
      if (removeConfig.value) {
        for (const name of removed) {
          // Bundle members' configs follow the per-member "clean config" choices made in the bundle
          // uninstall dialog, which win over this global setting.
          if (bundlePackages.has(name) || bundleMembers.has(name)) continue
          getConfigWriter(ctx)?.remove(name)
        }
      }
      for (const name of removed) {
        delete getWritableBundleRecords(config.value)[name]
        delete pendingBundleUninstalls.value[name]
      }
      for (const key of Object.keys(getPendingOverrides())) delete getPendingOverrides()[key]
      const saved = await patchMarketNextData({
        override: {},
        bundleRecords: getWritableBundleRecords(config.value),
      })
      if (!saved) message.warning(t('operations.confirm.saveBundleFailed'))
    }, undefined, selfUpdate ? {
      loadingText: t('operations.progress.selfUpdateTitle'),
      successText: t('operations.progress.selfSubmittedSuccess'),
      errorText: t('operations.progress.selfErrorToast'),
      timeoutText: t('operations.progress.installTimeout'),
      selfUpdate: true,
    } : undefined)
  }

  function clear() {
    showConfirm.value = false
    const override = getPendingOverrides()
    for (const key of Object.keys(override)) delete override[key]
    void patchMarketNextData({ override: { ...override } })
    pendingBundleUninstalls.value = {}
  }

  return { t, store, showConfirm, overrides, removeConfig, hasRemove, confirm, clear }
}

<template>
  <market-dialog
    v-if="store.market?.registry"
    v-model="showConfirm"
    class="confirm-panel"
    :title="t('operations.confirm.title')"
    width="640px"
    destroy-on-close
  >
    <p class="confirm-intro">{{ t('operations.confirm.intro', { count: Object.keys(overrides).length }) }}</p>
    <div class="confirm-change-list">
      <div v-for="(version, name) in overrides" :key="name" class="confirm-row">
        <strong :title="name">{{ name }}</strong>
        <span class="confirm-versions">
          <span>{{ store.dependencies?.[name]?.resolved || t('operations.confirm.notInstalled') }}</span>
          <span class="arrow">→</span>
          <span :class="['target', { remove: !version }]">{{ version || t('operations.confirm.removeDependency') }}</span>
        </span>
      </div>
    </div>
    <el-checkbox v-if="hasRemove" v-model="removeConfig" class="confirm-remove-config">
      {{ t('operations.confirm.removeConfig') }}
    </el-checkbox>
    <template #footer>
      <el-button @click="showConfirm = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" @click="confirm">{{ t('operations.confirm.apply') }}</el-button>
    </template>
  </market-dialog>
</template>

<script lang="ts" setup>

import { computed, ref } from 'vue'
import { message, send, store, useContext, useConfig } from '@koishijs/client'
import { ensureInstalledConfigs, getConfigWriter, showConfirm, install, pendingBundleUninstalls, MARKET_NEXT_PACKAGE } from './utils'
import { getPendingOverrides, getRemoveConfig, getWritableBundleRecords, patchMarketNextData } from '../utils'
import { useMarketNextI18n } from '../i18n'
import MarketDialog from './market-dialog.vue'

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

</script>

<style lang="scss">
.confirm-panel {
  .confirm-intro {
    margin: 0 0 0.75rem;
    color: var(--fg2);
  }

  .confirm-change-list {
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .confirm-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    margin-top: -1px;
    border-top: 1px solid var(--k-color-divider);
    padding: 0.5rem 0.875rem;

    strong {
      min-width: 0;
      font-weight: 500;
      overflow-wrap: anywhere;
    }
  }

  .confirm-versions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--fg2);
    font-variant-numeric: tabular-nums;

    .arrow {
      color: var(--fg3);
    }

    .target {
      color: var(--k-color-primary);
      font-weight: 600;

      &.remove {
        color: var(--danger);
      }
    }
  }

  .confirm-remove-config {
    margin-top: 0.75rem;
  }
}
</style>

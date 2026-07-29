<template>
  <el-dialog
    v-if="store.market?.registry"
    v-model="showConfirm"
    append-to-body
    align-center
    :class="['market-dialog', 'market-dialog--medium', 'market-dialog--contained', 'confirm-panel', modeClass]"
    destroy-on-close
  >
    <template #header>{{ t('operations.confirm.title') }}</template>
    <div class="confirm-change-list market-data-frame">
      <table class="market-data-table">
        <colgroup>
          <col width="auto">
          <col width="auto">
          <col width="auto">
        </colgroup>
        <thead>
          <tr>
            <th class="market-col-name">{{ t('operations.confirm.dependency') }}</th>
            <th class="market-col-version">{{ t('operations.confirm.oldVersion') }}</th>
            <th class="market-col-version">{{ t('operations.confirm.newVersion') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(version, name) in overrides" :key="name">
            <td class="market-col-name" :data-label="t('operations.confirm.dependency')">{{ name }}</td>
            <td class="market-col-version" :data-label="t('operations.confirm.oldVersion')">{{ store.dependencies?.[name]?.resolved || t('operations.confirm.notInstalled') }}</td>
            <td class="market-col-version" :data-label="t('operations.confirm.newVersion')">{{ version || t('operations.confirm.removeDependency') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <template #footer>
      <div class="left">
        <el-checkbox :disabled="!hasRemove" v-model="removeConfig">
          {{ t('operations.confirm.removeConfig') }}
        </el-checkbox>
      </div>
      <div class="right">
        <el-button type="danger" @click="clear">{{ t('operations.confirm.discard') }}</el-button>
        <el-button type="primary" @click="confirm">{{ t('operations.confirm.apply') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>

import { computed, ref } from 'vue'
import { message, send, store, useContext, useConfig } from '@koishijs/client'
import { ensureInstalledConfigs, getConfigWriter, showConfirm, install, pendingBundleUninstalls, MARKET_NEXT_PACKAGE } from './utils'
import { getFrontendMode, getPendingOverrides, getRemoveConfig, getWritableBundleRecords, patchMarketNextData } from '../utils'
import { useMarketNextI18n } from '../i18n'

const ctx = useContext()
const config = useConfig()
const { t } = useMarketNextI18n()
const overrides = computed(() => getPendingOverrides())
const modeClass = computed(() => `market-mode-${getFrontendMode(config.value)}`)

const removeConfig = ref(getRemoveConfig(config.value))

function clear() {
  showConfirm.value = false
  const override = getPendingOverrides()
  for (const key of Object.keys(override)) delete override[key]
  void patchMarketNextData({ override: { ...override } })
  pendingBundleUninstalls.value = {}
}

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
    errorText: t('operations.progress.errorSelf'),
    timeoutText: t('operations.progress.installTimeout'),
    selfUpdate: true,
  } : undefined)
}

</script>

<style lang="scss">

.confirm-panel {
  --confirm-text-muted: var(--market-dialog-text-muted);
  --confirm-border-soft: var(--market-dialog-border-soft);

  .el-dialog__body {
    display: flex;
    flex-direction: column;
  }

  .confirm-change-list {
    flex: 1 1 auto;
    min-height: 0;
    margin: 0.75rem 0;
  }

  .market-data-table {
    min-width: 36rem;

    th,
    td {
      white-space: nowrap;
    }
  }

}

@media (max-width: 600px) {
  .confirm-panel {
    .confirm-change-list {
      margin: 0;
    }

    .market-data-table {
      display: block;
      min-width: 0;

      thead {
        display: none;
      }

      tbody {
        display: block;
      }

      tr {
        display: grid;
        padding: 7px 10px;
        border-bottom: 1px solid var(--confirm-border-soft);

        &:last-child {
          border-bottom: 0;
        }
      }

      td {
        display: flex;
        align-items: flex-start;
        justify-content: flex-end;
        gap: 10px;
        min-width: 0;
        padding: 4px 0;
        border: 0;
        white-space: normal;
        overflow-wrap: anywhere;

        &::before {
          content: attr(data-label);
          flex: 0 0 auto;
          margin-right: auto;
          color: var(--confirm-text-muted);
          text-align: left;
        }
      }
    }
  }
}

</style>

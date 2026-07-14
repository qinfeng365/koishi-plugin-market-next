<template>
  <el-dialog v-if="store.market?.registry" v-model="showConfirm" :class="['confirm-panel', modeClass]" destroy-on-close>
    <template #header>{{ t('operations.confirm.title') }}</template>
    <div class="confirm-change-list">
      <table>
        <colgroup>
          <col width="auto">
          <col width="auto">
          <col width="1rem">
          <col width="auto">
        </colgroup>
        <thead>
          <tr>
            <th>{{ t('operations.confirm.dependency') }}</th>
            <th>{{ t('operations.confirm.oldVersion') }}</th>
            <th></th>
            <th>{{ t('operations.confirm.newVersion') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(version, name) in overrides" :key="name">
            <td>{{ name }}</td>
            <td>{{ store.dependencies?.[name]?.resolved || t('operations.confirm.notInstalled') }}</td>
            <td class="arrow"><span><k-icon name="arrow-right"></k-icon></span></td>
            <td>{{ version || t('operations.confirm.removeDependency') }}</td>
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
import { ensureInstalledConfigs, showConfirm, install, pendingBundleUninstalls, MARKET_NEXT_PACKAGE } from './utils'
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
        ctx.configWriter?.remove(name)
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
  --confirm-surface: var(--k-card-bg, var(--el-bg-color-overlay, var(--el-bg-color, #18181b)));
  --confirm-surface-muted: color-mix(in srgb, var(--confirm-surface) 84%, var(--k-side-bg, var(--el-fill-color-light, #f8fafc)) 16%);
  --confirm-text: var(--fg1, var(--el-text-color-primary, #1e293b));
  --confirm-text-muted: var(--fg2, var(--el-text-color-regular, #64748b));
  --confirm-border-base: var(--k-color-border, var(--el-border-color, #d4d8e2));
  --confirm-border: color-mix(in srgb, var(--confirm-border-base) 78%, var(--confirm-text) 22%);
  --confirm-border-soft: color-mix(in srgb, var(--confirm-border-base) 72%, transparent);
  --confirm-primary: var(--k-color-primary, var(--el-color-primary, #3b82f6));
  --confirm-row-bg: color-mix(in srgb, var(--confirm-surface) 90%, var(--confirm-surface-muted) 10%);
  --confirm-row-hover: color-mix(in srgb, var(--confirm-text) 5%, var(--confirm-row-bg));

  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(48rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  max-height: calc(100dvh - 2rem);
  margin: 1rem auto;
  border: 1px solid var(--confirm-border);
  border-radius: 12px;
  overflow: hidden;
  color: var(--confirm-text);
  background: var(--confirm-surface);
  box-shadow: none;

  .el-dialog__header {
    flex: 0 0 auto;
    border-bottom: 1px solid var(--confirm-border-soft);
    background: color-mix(in srgb, var(--confirm-surface-muted) 72%, var(--confirm-surface));
  }

  .el-dialog__title {
    color: var(--confirm-text);
  }

  .el-dialog__headerbtn {
    .el-dialog__close {
      color: var(--confirm-text-muted);
    }

    &:hover .el-dialog__close {
      color: var(--confirm-primary);
    }
  }

  .el-dialog__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background: var(--confirm-surface);
  }

  .el-dialog__footer {
    flex: 0 0 auto;
    border-top: 1px solid var(--confirm-border-soft);
    background: color-mix(in srgb, var(--confirm-surface) 86%, var(--confirm-surface-muted) 14%);
  }

  .confirm-change-list {
    flex: 1 1 auto;
    min-height: 0;
    margin: 0.75rem 0;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--confirm-border);
    border-radius: 8px;
    background: var(--confirm-row-bg);
  }

  table {
    width: 100%;
    min-width: 36rem;
    border-collapse: separate;
    border-spacing: 0;
    background: var(--confirm-row-bg);
    box-shadow: none;

    thead, tbody {
      td, th {
        padding: 0.6rem 0.875rem;
        white-space: nowrap;
        border-bottom: 1px solid var(--confirm-border-soft);
        border-right: 1px solid var(--confirm-border-soft);
        font-size: 0.82rem;

        &:last-child {
          border-right: none;
        }
      }
    }

    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: color-mix(in srgb, var(--confirm-text) 5%, var(--confirm-surface-muted));
      color: var(--confirm-text-muted);
      font-weight: 600;
      text-align: left;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tbody tr {
      background: var(--confirm-row-bg);
      transition: background-color 0.15s ease;

      &:hover {
        background: var(--confirm-row-hover);
      }
    }

    td {
      color: var(--confirm-text);
    }
  }

  td.arrow {
    padding: 0;
    color: var(--confirm-text-muted);

    span {
      display: flex;
      justify-content: center;
      align-items: center;
    }
  }

  .el-dialog__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;

    .left {
      min-width: 0;
      color: var(--confirm-text-muted);
    }

    .right {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0.5rem;
    }
  }

  &.market-mode-polished {
    --confirm-row-hover: color-mix(in srgb, var(--confirm-primary) 7%, var(--confirm-row-bg));

    border-color: color-mix(in srgb, var(--confirm-border) 84%, var(--confirm-primary) 16%);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--confirm-primary) 5%, transparent), transparent 44%),
      var(--confirm-surface);
    box-shadow:
      0 18px 48px color-mix(in srgb, var(--confirm-text) 18%, transparent),
      0 0 0 1px color-mix(in srgb, var(--confirm-primary) 10%, transparent) inset;

    .el-dialog__header {
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--confirm-primary) 6%, transparent), transparent 68%),
        color-mix(in srgb, var(--confirm-surface-muted) 72%, var(--confirm-surface));
    }

    .el-dialog__body {
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--confirm-primary) 2%, transparent), transparent),
        var(--confirm-surface);
    }

    table th {
      background:
        linear-gradient(90deg, color-mix(in srgb, var(--confirm-primary) 6%, transparent), transparent 68%),
        color-mix(in srgb, var(--confirm-text) 5%, var(--confirm-surface-muted));
    }

    td.arrow {
      color: var(--confirm-primary);
    }
  }

  &.market-mode-performance {
    box-shadow: none;
  }
}

@media (max-width: 600px) {
  .confirm-panel {
    width: calc(100vw - 1rem);
    max-height: calc(100vh - 1rem);
    max-height: calc(100dvh - 1rem);
    margin: 0.5rem auto;

    .el-dialog__header {
      padding: 12px 44px 10px 14px;
    }

    .el-dialog__body {
      padding: 8px 10px;
    }

    .el-dialog__footer {
      align-items: stretch;
      flex-direction: column;
      padding: 10px;

      .left {
        width: 100%;
      }

      .right {
        width: 100%;

        .el-button {
          flex: 1 1 8rem;
          margin-left: 0;
        }
      }
    }

    .confirm-change-list {
      margin: 0;
    }
  }
}

</style>

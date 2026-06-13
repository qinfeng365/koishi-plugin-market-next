<template>
  <el-dialog v-if="store.market?.registry" v-model="showConfirm" class="confirm-panel" destroy-on-close>
    <template #header>确认依赖更改</template>
    <table>
      <colgroup>
        <col width="auto">
        <col width="auto">
        <col width="1rem">
        <col width="auto">
      </colgroup>
      <thead>
        <tr>
          <th>依赖</th>
          <th>旧版本</th>
          <th></th>
          <th>新版本</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(version, name) in config.market.override" :key="name">
          <td>{{ name }}</td>
          <td>{{ store.dependencies?.[name]?.resolved || '未安装' }}</td>
          <td class="arrow"><span><k-icon name="arrow-right"></k-icon></span></td>
          <td>{{ version || '移除依赖' }}</td>
        </tr>
      </tbody>
    </table>
    <template #footer>
      <div class="left">
        <el-checkbox :disabled="!hasRemove" v-model="removeConfig">
          为卸载的插件删除配置
        </el-checkbox>
      </div>
      <div class="right">
        <el-button type="danger" @click="clear">丢弃改动</el-button>
        <el-button type="primary" @click="confirm">应用更改</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>

import { computed, ref } from 'vue'
import { send, store, useContext, useConfig } from '@koishijs/client'
import { ensureInstalledConfigs, showConfirm, install, pendingBundleUninstalls } from './utils'

const ctx = useContext()
const config = useConfig()

const removeConfig = ref(config.value.market?.removeConfig)

function clear() {
  showConfirm.value = false
  config.value.market.override = {}
  pendingBundleUninstalls.value = {}
}

const hasRemove = computed(() => {
  return Object.values(config.value.market.override).some(version => !version)
})

function confirm() {
  showConfirm.value = false
  const override = { ...config.value.market.override }
  const removed = Object.entries(override)
    .filter(([, value]) => !value)
    .map(([name]) => name)
  const bundleRemovals = Object.fromEntries(Object.entries(pendingBundleUninstalls.value)
    .filter(([name]) => removed.includes(name)))
  const bundlePackages = new Set(Object.keys(bundleRemovals))
  const bundleMembers = new Set(Object.values(bundleRemovals)
    .flatMap(item => item.members ?? []))
  return install(config.value.market.override, async () => {
    await ensureInstalledConfigs(ctx, Object.entries(override)
      .filter(([, value]) => value)
      .map(([name]) => name), true)
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
      delete config.value.market.bundleRecords?.[name]
      delete pendingBundleUninstalls.value[name]
    }
  })
}

</script>

<style lang="scss">

.confirm-panel {
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid var(--k-color-border, #e2e8f0);
    border-radius: 8px;
    overflow: hidden;
    margin: 0.75rem 0;

    thead, tbody {
      td, th {
        padding: 0.6rem 0.875rem;
        white-space: nowrap;
        border-bottom: 1px solid var(--k-color-border, #e2e8f0);
        border-right: 1px solid var(--k-color-border, #e2e8f0);
        font-size: 0.82rem;

        &:last-child {
          border-right: none;
        }
      }
    }

    th {
      background: color-mix(in srgb, var(--fg1, #1e293b) 4%, var(--k-side-bg, #f8fafc));
      color: var(--fg2, #64748b);
      font-weight: 600;
      text-align: left;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tbody tr {
      background: var(--k-card-bg, #ffffff);
      transition: background 0.15s;

      &:hover {
        background: color-mix(in srgb, var(--k-color-primary, #3b82f6) 4%, var(--k-card-bg, #ffffff));
      }
    }
  }

  td.arrow {
    padding: 0;

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
  }
}

</style>

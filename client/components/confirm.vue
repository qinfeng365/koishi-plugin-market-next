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
import MarketDialog from './market-dialog.vue'
import { useConfirm } from '../composables/use-confirm'

const { t, store, showConfirm, overrides, removeConfig, hasRemove, confirm, clear } = useConfirm()
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

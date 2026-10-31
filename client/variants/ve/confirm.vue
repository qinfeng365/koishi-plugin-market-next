<template>
  <el-dialog v-if="store.market?.registry" v-model="showConfirm" class="ve-confirm-panel" destroy-on-close>
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
import { useConfirm } from '../../composables/use-confirm'

const { t, store, showConfirm, overrides, removeConfig, hasRemove, confirm, clear } = useConfirm()
</script>

<style lang="scss">

.ve-confirm-panel {
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

    }

@media (max-width: 600px) {
  .ve-confirm-panel {
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

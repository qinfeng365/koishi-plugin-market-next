<template>
  <el-dialog
    v-model="showEnvironmentVersions"
    append-to-body
    destroy-on-close
    :class="['environment-versions-dialog', modeClass]"
    :title="t('environment.title')"
    width="min(1080px, calc(100vw - 24px))"
  >
    <div class="environment-toolbar">
      <span>{{ loading ? t('environment.syncing') : t('environment.count', { count: snapshots.length }) }}</span>
      <el-button :loading="loading" @click="loadSnapshots(true)">{{ t('environment.refresh') }}</el-button>
    </div>

    <div class="environment-layout">
      <aside class="snapshot-sidebar">
        <div class="snapshot-heading">
          <span>{{ t('environment.snapshots') }}</span>
          <span>{{ snapshots.length }}</span>
        </div>
        <div class="snapshot-list">
          <button
            v-for="snapshot in snapshots"
            :key="snapshot.id"
            type="button"
            :class="['snapshot-row', { active: snapshot.id === selectedId, current: snapshot.current }]"
            @click="selectSnapshot(snapshot.id)"
          >
            <span class="snapshot-icon">
              <market-icon :name="snapshot.current ? 'verified' : 'file-archive'"></market-icon>
            </span>
            <span class="snapshot-main">
              <strong>{{ snapshot.current ? t('environment.currentEnvironment') : t('environment.savedEnvironment') }}</strong>
              <span>{{ formatDate(snapshot.createdAt) }}</span>
              <small>{{ sourceText(snapshot.source) }} · {{ t('environment.dependencies', { count: snapshot.dependencyCount }) }}</small>
            </span>
            <span v-if="snapshot.current" class="current-pill">{{ t('environment.current') }}</span>
          </button>

          <div v-if="loading && !snapshots.length" class="environment-state">{{ t('environment.reading') }}</div>
          <div v-else-if="loadError && !snapshots.length" class="environment-state error">{{ loadError }}</div>
          <div v-else-if="!snapshots.length" class="environment-state">{{ t('environment.empty') }}</div>
        </div>
      </aside>

      <section class="snapshot-detail">
        <div v-if="previewLoading" class="environment-state">{{ t('environment.readingPreview') }}</div>
        <div v-else-if="previewError" class="environment-state error">{{ previewError }}</div>
        <template v-else-if="preview">
          <header class="preview-header">
            <div>
              <span class="preview-eyebrow">{{ t('environment.targetEnvironment') }}</span>
              <h3>{{ preview.snapshot.current ? t('environment.currentEnvironment') : formatDate(preview.snapshot.createdAt) }}</h3>
              <p>{{ sourceText(preview.snapshot.source) }} · {{ t('environment.dependencies', { count: preview.snapshot.dependencyCount }) }}</p>
            </div>
            <div class="preview-summary">
              <span class="changed">{{ t('environment.changedCount', { count: changedCount }) }}</span>
              <span>{{ t('environment.unchangedCount', { count: unchangedCount }) }}</span>
              <span v-if="preview.unsupportedCount" class="blocked">{{ t('environment.unsupportedCount', { count: preview.unsupportedCount }) }}</span>
            </div>
          </header>

          <k-comment type="warning" class="scope-warning">
            {{ t('environment.scopeWarning') }}
          </k-comment>

          <div class="diff-list">
            <div class="diff-header">
              <span>{{ t('environment.dependency') }}</span>
              <span>{{ t('environment.currentVersion') }}</span>
              <span></span>
              <span>{{ t('environment.targetVersion') }}</span>
              <span>{{ t('environment.status') }}</span>
            </div>
            <div v-for="change in orderedChanges" :key="change.name" :class="['diff-row', change.status]">
              <strong :title="change.name">{{ change.name }}</strong>
              <span class="version-value" :title="versionText(change.currentVersion)">{{ versionText(change.currentVersion) }}</span>
              <span class="version-arrow">→</span>
              <span class="version-value target" :title="versionText(change.targetVersion)">{{ versionText(change.targetVersion) }}</span>
              <span :class="['change-status', change.status]">{{ statusText(change.status) }}</span>
              <small v-if="change.reason" class="change-reason">{{ reasonText(change.reason) }}</small>
            </div>
          </div>
        </template>
        <div v-else class="environment-state">{{ t('environment.selectSnapshot') }}</div>
      </section>
    </div>

    <template #footer>
      <el-button @click="showEnvironmentVersions = false">{{ t('common.actions.close') }}</el-button>
      <el-button type="primary" :disabled="!canApply" @click="confirmVisible = true">
        {{ preview?.snapshot.current ? t('environment.alreadyCurrent') : t('environment.restore') }}
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="confirmVisible"
    append-to-body
    :class="['environment-confirm-dialog', modeClass]"
    :title="t('environment.confirmTitle')"
    width="min(520px, calc(100vw - 24px))"
  >
    <p>{{ t('environment.confirmText', { count: preview?.actionableCount ?? 0 }) }}</p>
    <k-comment type="warning">{{ t('environment.scopeWarning') }}</k-comment>
    <k-comment v-if="removedCount" type="danger">
      {{ t('environment.removeWarning', { count: removedCount }) }}
    </k-comment>
    <template #footer>
      <el-button @click="confirmVisible = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" @click="applySnapshot">{{ t('environment.confirmRestore') }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { send, useConfig } from '@koishijs/client'
import type {
  EnvironmentChangeStatus,
  EnvironmentSnapshotChange,
  EnvironmentSnapshotPreview,
  EnvironmentSnapshotSource,
  EnvironmentSnapshotSummary,
} from 'koishi-plugin-market-next'
import { getFrontendMode } from '../utils'
import { applyEnvironmentSnapshot, showEnvironmentVersions } from './utils'
import { useMarketNextI18n } from '../i18n'
import MarketIcon from '../market/icons'

const config = useConfig()
const { t, locale } = useMarketNextI18n()
const modeClass = computed(() => `market-mode-${getFrontendMode(config.value)}`)
const snapshots = ref<EnvironmentSnapshotSummary[]>([])
const selectedId = ref('')
const preview = ref<EnvironmentSnapshotPreview>()
const loading = ref(false)
const previewLoading = ref(false)
const loadError = ref('')
const previewError = ref('')
const confirmVisible = ref(false)
let previewSerial = 0

watch(showEnvironmentVersions, (visible) => {
  if (visible) void loadSnapshots()
  else confirmVisible.value = false
})

const statusOrder: Record<EnvironmentChangeStatus, number> = {
  unsupported: 0,
  removed: 1,
  downgrade: 2,
  upgrade: 3,
  added: 4,
  changed: 5,
  unchanged: 6,
}

const orderedChanges = computed(() => [...(preview.value?.changes ?? [])].sort((left, right) => {
  return statusOrder[left.status] - statusOrder[right.status] || left.name.localeCompare(right.name)
}))

const changedCount = computed(() => preview.value?.changes.filter(change => change.status !== 'unchanged').length ?? 0)
const unchangedCount = computed(() => preview.value?.changes.filter(change => change.status === 'unchanged').length ?? 0)
const removedCount = computed(() => preview.value?.changes.filter(change => change.status === 'removed').length ?? 0)
const canApply = computed(() => !!preview.value
  && !preview.value.snapshot.current
  && preview.value.actionableCount > 0
  && preview.value.unsupportedCount === 0)

async function loadSnapshots(preserveSelection = false) {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    snapshots.value = await (send('market/environment-snapshots') ?? Promise.resolve([]))
    const previous = preserveSelection && snapshots.value.some(snapshot => snapshot.id === selectedId.value)
      ? selectedId.value
      : ''
    const target = previous || snapshots.value.find(snapshot => !snapshot.current)?.id || snapshots.value[0]?.id || ''
    if (target) await selectSnapshot(target, true)
    else {
      selectedId.value = ''
      preview.value = undefined
    }
  } catch (error) {
    console.error(error)
    loadError.value = t('environment.loadFailed')
  } finally {
    loading.value = false
  }
}

async function selectSnapshot(id: string, force = false) {
  if (!force && id === selectedId.value && preview.value) return
  selectedId.value = id
  preview.value = undefined
  previewError.value = ''
  previewLoading.value = true
  const serial = ++previewSerial
  try {
    const result = await (send('market/environment-snapshot-preview', id) ?? Promise.resolve(undefined))
    if (serial !== previewSerial) return
    if (!result) throw new Error('environment snapshot not found')
    preview.value = result
  } catch (error) {
    if (serial !== previewSerial) return
    console.error(error)
    previewError.value = t('environment.previewFailed')
  } finally {
    if (serial === previewSerial) previewLoading.value = false
  }
}

function applySnapshot() {
  if (!canApply.value || !preview.value) return
  const id = preview.value.snapshot.id
  const selfUpdate = preview.value.changes.some(change => {
    return change.name === 'koishi-plugin-market-next' && change.status !== 'unchanged'
  })
  confirmVisible.value = false
  void applyEnvironmentSnapshot(id, selfUpdate)
}

function formatDate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return t('common.messages.timeUnknown')
  return new Date(value).toLocaleString(locale.value)
}

function sourceText(source: EnvironmentSnapshotSource) {
  switch (source) {
    case 'startup': return t('environment.sourceStartup')
    case 'operation': return t('environment.sourceOperation')
    default: return t('environment.sourceExternal')
  }
}

function versionText(version?: string) {
  return version || t('environment.notInstalled')
}

function statusText(status: EnvironmentChangeStatus) {
  return t(`environment.change.${status}`)
}

function reasonText(reason: NonNullable<EnvironmentSnapshotChange['reason']>) {
  return t(`environment.reason.${reason}`)
}
</script>

<style lang="scss">
.environment-versions-dialog,
.environment-confirm-dialog {
  --environment-surface: var(--k-card-bg, var(--el-bg-color-overlay, var(--el-bg-color)));
  --environment-muted: var(--k-side-bg, var(--el-fill-color-light));
  --environment-text: var(--fg1, var(--el-text-color-primary));
  --environment-text-muted: var(--fg2, var(--el-text-color-regular));
  --environment-border: var(--k-color-border, var(--el-border-color));
  --environment-primary: var(--k-color-primary, var(--el-color-primary));
  --environment-success: var(--k-color-success, var(--el-color-success));
  --environment-warning: var(--k-color-warning, var(--el-color-warning));
  --environment-danger: var(--k-color-danger, var(--el-color-danger));

  color: var(--environment-text);
  border: 1px solid color-mix(in srgb, var(--environment-border) 84%, transparent);
  background: var(--environment-surface);

  .el-dialog__title { color: var(--environment-text); font-weight: 600; }
  .el-dialog__header { border-bottom: 1px solid color-mix(in srgb, var(--environment-border) 76%, transparent); }
  .el-dialog__footer { border-top: 1px solid color-mix(in srgb, var(--environment-border) 76%, transparent); }
}

.environment-versions-dialog {
  .el-dialog__body { padding-top: 14px; }

  .environment-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    color: var(--environment-text-muted);
    font-size: 12px;
  }

  .environment-layout {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    height: min(520px, calc(100vh - 215px));
    height: min(520px, calc(100dvh - 215px));
    min-height: 360px;
    overflow: hidden;
    border: 1px solid var(--environment-border);
    border-radius: 8px;
    background: var(--environment-surface);
  }

  .snapshot-sidebar {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--environment-border);
    background: color-mix(in srgb, var(--environment-muted) 60%, var(--environment-surface));
  }

  .snapshot-heading {
    flex: 0 0 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--environment-border) 72%, transparent);
    color: var(--environment-text-muted);
    font-size: 11px;
    font-weight: 600;
  }

  .snapshot-list {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
  }

  .snapshot-row {
    width: 100%;
    min-height: 78px;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 10px 12px;
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--environment-border) 68%, transparent);
    border-radius: 0;
    color: var(--environment-text);
    background: transparent;
    text-align: left;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      outline: none;
      background: color-mix(in srgb, var(--environment-primary) 7%, var(--environment-surface));
    }

    &.active {
      background: color-mix(in srgb, var(--environment-primary) 11%, var(--environment-surface));
      box-shadow: inset 3px 0 var(--environment-primary);
    }
  }

  .snapshot-icon {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--environment-primary) 24%, var(--environment-border));
    border-radius: 6px;
    color: var(--environment-primary);
    background: color-mix(in srgb, var(--environment-primary) 8%, var(--environment-surface));
  }

  .snapshot-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;

    strong,
    span,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong { color: var(--environment-text); font-size: 12px; }
    span { color: var(--environment-text-muted); font-size: 11px; }
    small { color: color-mix(in srgb, var(--environment-text-muted) 78%, transparent); font-size: 10px; }
  }

  .current-pill {
    padding: 2px 6px;
    border: 1px solid color-mix(in srgb, var(--environment-success) 34%, var(--environment-border));
    border-radius: 8px;
    color: var(--environment-success);
    background: color-mix(in srgb, var(--environment-success) 8%, var(--environment-surface));
    font-size: 10px;
    white-space: nowrap;
  }

  .snapshot-detail {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    overflow: hidden;
  }

  .preview-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;

    h3 { margin: 2px 0 3px; color: var(--environment-text); font-size: 16px; }
    p { margin: 0; color: var(--environment-text-muted); font-size: 11px; }
  }

  .preview-eyebrow {
    color: var(--environment-primary);
    font-size: 10px;
    font-weight: 700;
  }

  .preview-summary {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;

    span {
      padding: 3px 7px;
      border: 1px solid var(--environment-border);
      border-radius: 8px;
      color: var(--environment-text-muted);
      background: color-mix(in srgb, var(--environment-muted) 44%, var(--environment-surface));
      font-size: 10px;
    }

    .changed { color: var(--environment-primary); border-color: color-mix(in srgb, var(--environment-primary) 32%, var(--environment-border)); }
    .blocked { color: var(--environment-danger); border-color: color-mix(in srgb, var(--environment-danger) 32%, var(--environment-border)); }
  }

  .scope-warning { flex: 0 0 auto; margin: 0; }

  .diff-list {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--environment-border);
    border-radius: 6px;
    background: color-mix(in srgb, var(--environment-muted) 30%, var(--environment-surface));
  }

  .diff-header,
  .diff-row {
    display: grid;
    grid-template-columns: minmax(170px, 1.5fr) minmax(90px, 0.8fr) 18px minmax(90px, 0.8fr) 72px;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
  }

  .diff-header {
    position: sticky;
    top: 0;
    z-index: 1;
    min-height: 34px;
    border-bottom: 1px solid var(--environment-border);
    color: var(--environment-text-muted);
    background: color-mix(in srgb, var(--environment-muted) 74%, var(--environment-surface));
    font-size: 10px;
    font-weight: 600;
  }

  .diff-row {
    min-height: 38px;
    border-bottom: 1px solid color-mix(in srgb, var(--environment-border) 64%, transparent);
    font-size: 11px;

    &:last-child { border-bottom: 0; }
    &.unchanged { opacity: 0.68; }

    > strong,
    .version-value {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    > strong { color: var(--environment-text); }
  }

  .version-value {
    color: var(--environment-text-muted);
    font-family: Consolas, Monaco, monospace;
    text-align: right;

    &.target { color: var(--environment-primary); }
  }

  .version-arrow { color: var(--environment-text-muted); text-align: center; }

  .change-status {
    justify-self: end;
    min-width: 58px;
    padding: 2px 5px;
    border: 1px solid var(--environment-border);
    border-radius: 7px;
    color: var(--environment-text-muted);
    text-align: center;
    font-size: 10px;

    &.upgrade,
    &.added { color: var(--environment-success); border-color: color-mix(in srgb, var(--environment-success) 34%, var(--environment-border)); }
    &.downgrade,
    &.changed { color: var(--environment-warning); border-color: color-mix(in srgb, var(--environment-warning) 34%, var(--environment-border)); }
    &.removed,
    &.unsupported { color: var(--environment-danger); border-color: color-mix(in srgb, var(--environment-danger) 34%, var(--environment-border)); }
  }

  .change-reason {
    grid-column: 1 / -1;
    padding-bottom: 6px;
    color: var(--environment-danger);
    font-size: 10px;
  }

  .environment-state {
    margin: auto;
    padding: 24px;
    color: var(--environment-text-muted);
    font-size: 13px;
    text-align: center;

    &.error { color: var(--environment-danger); }
  }

  &.market-mode-polished {
    border-color: color-mix(in srgb, var(--environment-primary) 16%, var(--environment-border));
    box-shadow: 0 18px 46px color-mix(in srgb, var(--environment-text) 16%, transparent);

    .environment-layout { border-color: color-mix(in srgb, var(--environment-primary) 12%, var(--environment-border)); }
    .snapshot-row.active { background: color-mix(in srgb, var(--environment-primary) 13%, var(--environment-surface)); }
  }
}

.environment-confirm-dialog {
  p { margin-top: 0; color: var(--environment-text); line-height: 1.6; }
  .k-comment + .k-comment { margin-top: 10px; }
}

@media (max-width: 760px) {
  .environment-versions-dialog {
    .el-dialog__header { padding: 12px 44px 10px 14px; }
    .el-dialog__body { padding: 10px; }

    .environment-toolbar {
      align-items: flex-start;
      flex-wrap: wrap;
      margin-bottom: 8px;

      > span { flex: 1 1 9rem; min-width: 0; }
      .el-button { margin-left: auto; }
    }

    .environment-layout {
      grid-template-columns: 1fr;
      grid-template-rows: 148px minmax(0, 1fr);
      height: min(650px, max(360px, calc(100dvh - 185px)));
      min-height: 360px;
    }

    .snapshot-sidebar {
      border-right: 0;
      border-bottom: 1px solid var(--environment-border);
    }

    .snapshot-row {
      min-height: 64px;
      grid-template-columns: 24px minmax(0, 1fr) auto;
      gap: 7px;
      padding: 8px 10px;
    }

    .snapshot-icon { width: 24px; height: 24px; }
    .snapshot-main {
      strong { font-size: 11px; }
      span { font-size: 10px; }
      small { font-size: 9px; }
    }

    .current-pill { padding-inline: 5px; font-size: 9px; }
    .snapshot-detail { padding: 10px; }
    .preview-header {
      flex-direction: column;
      gap: 6px;

      h3 { font-size: 14px; }
    }
    .preview-summary { justify-content: flex-start; }

    .diff-header { display: none; }
    .diff-row {
      grid-template-columns: minmax(0, 1fr) 12px minmax(0, 1fr) minmax(48px, auto);
      gap: 5px;
      padding-block: 7px;
      overflow: hidden;

      > strong { grid-column: 1 / -1; }
      .version-value {
        max-width: 100%;
        font-size: 10px;
        text-align: left;
      }
      .change-status {
        min-width: 48px;
        max-width: 64px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .el-dialog__footer {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;

      .el-button { flex: 1 1 8rem; margin-left: 0; }
    }
  }

  .environment-confirm-dialog {
    .el-dialog__header { padding: 12px 44px 10px 14px; }
    .el-dialog__body { padding: 12px 14px; }
    .el-dialog__footer {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;

      .el-button { flex: 1 1 8rem; margin-left: 0; }
    }
  }
}
</style>

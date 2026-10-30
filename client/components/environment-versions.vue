<template>
  <market-dialog
    v-model="dialogVisible"
    append-to-body
    destroy-on-close
    class="environment-versions-dialog"
    :title="t('environment.title')"
    :width="hasHistory ? '1000px' : '520px'"
  >
    <empty-state
      v-if="!hasHistory"
      icon="market-next:versions"
      :title="loading ? t('environment.reading') : loadError ? t('environment.loadFailedTitle') : t('environment.emptyTitle')"
      :description="loading ? '' : loadError || t('environment.empty')"
    ></empty-state>

    <template v-else>
      <p class="dialog-intro">{{ t('environment.intro') }}</p>

      <div class="environment-layout">
        <el-scrollbar class="snapshot-list">
          <button
            v-for="snapshot in snapshots"
            :key="snapshot.id"
            type="button"
            :class="['snapshot-row', { active: snapshot.id === selectedId }]"
            @click="selectSnapshot(snapshot.id)"
          >
            <span class="snapshot-title">
              <span class="snapshot-name">{{ snapshot.current ? t('environment.currentEnvironment') : formatDate(snapshot.createdAt) }}</span>
              <span :class="['source-tag', { current: snapshot.current }]" :title="sourceText(snapshot.source)">
                {{ snapshot.current ? t('environment.current') : sourceText(snapshot.source) }}
              </span>
            </span>
            <span class="snapshot-meta">
              <template v-if="snapshot.current">{{ formatDate(snapshot.createdAt) }} · </template>
              {{ t('environment.dependencies', { count: snapshot.dependencyCount }) }}
            </span>
          </button>
        </el-scrollbar>

        <el-scrollbar class="snapshot-detail" view-class="snapshot-detail-view" tag="section">
          <div v-if="previewLoading" class="environment-state">{{ t('environment.readingPreview') }}</div>
          <div v-else-if="previewError" class="environment-state error">{{ previewError }}</div>
          <div v-else-if="preview?.snapshot.current" class="environment-state">{{ t('environment.isCurrent') }}</div>
          <template v-else-if="preview">
            <header class="preview-header">
              <strong>{{ formatDate(preview.snapshot.createdAt) }}</strong>
              · {{ t('environment.changedCount', { count: changedCount }) }}
              <span v-if="preview.unsupportedCount" class="blocked"> · {{ t('environment.unsupportedCount', { count: preview.unsupportedCount }) }}</span>
            </header>

            <div class="change-stats">
              <div
                v-for="status in (['upgrade', 'downgrade', 'added', 'removed'] as const)"
                :key="status"
                :class="['change-stat', status, { empty: !preview.changes.some(change => change.status === status) }]"
              >
                <strong>{{ preview.changes.filter(change => change.status === status).length }}</strong>
                <span>{{ statusText(status) }}</span>
              </div>
            </div>

            <p v-if="!changedCount" class="environment-state">{{ t('environment.noChanges') }}</p>
            <div v-if="visibleChanges.length" class="diff-list">
              <div v-for="change in visibleChanges" :key="change.name" :class="['diff-row', change.status]">
                <strong :title="change.name">{{ change.name }}</strong>
                <span v-if="change.status === 'unchanged'" class="diff-versions">{{ versionText(change.currentVersion) }}</span>
                <span v-else class="diff-versions">
                  <span>{{ versionText(change.currentVersion) }}</span>
                  <span class="version-arrow">→</span>
                  <span class="target">{{ versionText(change.targetVersion) }}</span>
                </span>
                <span :class="['change-status', change.status]">{{ statusText(change.status) }}</span>
                <small v-if="change.reason" class="change-reason">{{ reasonText(change.reason) }}</small>
              </div>
            </div>

            <el-button v-if="unchangedCount" class="toggle-unchanged" type="primary" text size="small" @click="showUnchanged = !showUnchanged">
              {{ showUnchanged ? t('environment.hideUnchanged') : t('environment.showUnchanged', { count: unchangedCount }) }}
            </el-button>

            <p class="scope-note">{{ t('environment.scopeWarning') }}</p>
          </template>
        </el-scrollbar>
      </div>
    </template>

    <template #footer>
      <el-button :loading="loading" @click="loadSnapshots(true)">{{ t('environment.refresh') }}</el-button>
      <el-button @click="showEnvironmentVersions = false">{{ t('common.actions.close') }}</el-button>
      <el-button v-if="preview && !preview.snapshot.current" type="primary" :disabled="!canApply" @click="confirmVisible = true">
        {{ t('environment.restore') }}
      </el-button>
    </template>
  </market-dialog>

  <market-dialog
    v-model="confirmVisible"
    append-to-body
    class="environment-confirm-dialog"
    :title="t('environment.confirmTitle')"
    width="520px"
  >
    <p>{{ t('environment.confirmText', { count: preview?.actionableCount ?? 0 }) }}</p>
    <k-comment type="warning"><p>{{ t('environment.scopeWarning') }}</p></k-comment>
    <k-comment v-if="removedCount" type="danger">
      <p>{{ t('environment.removeWarning', { count: removedCount }) }}</p>
    </k-comment>
    <template #footer>
      <el-button @click="confirmVisible = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" @click="applySnapshot">{{ t('environment.confirmRestore') }}</el-button>
    </template>
  </market-dialog>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { message, send } from '@koishijs/client'
import type {
  EnvironmentChangeStatus,
  EnvironmentSnapshotChange,
  EnvironmentSnapshotPreview,
  EnvironmentSnapshotSource,
  EnvironmentSnapshotSummary,
} from 'koishi-plugin-market-next'
import { applyEnvironmentSnapshot, createSerialLoader, showEnvironmentVersions, useDeferredDialog } from './utils'
import { useMarketNextI18n } from '../i18n'
import EmptyState from './empty-state.vue'
import MarketDialog from './market-dialog.vue'

const { t, locale } = useMarketNextI18n()
const snapshots = ref<EnvironmentSnapshotSummary[]>([])
const selectedId = ref('')
const preview = ref<EnvironmentSnapshotPreview>()
const loading = ref(false)
const previewLoading = ref(false)
const loadError = ref('')
const previewError = ref('')
const confirmVisible = ref(false)
const showUnchanged = ref(false)
const hasHistory = computed(() => snapshots.value.some(snapshot => !snapshot.current))
let previewSerial = 0

const dialogVisible = useDeferredDialog(showEnvironmentVersions, () => loadSnapshots())
watch(showEnvironmentVersions, (visible) => {
  if (!visible) confirmVisible.value = false
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

const visibleChanges = computed(() => showUnchanged.value ? orderedChanges.value : orderedChanges.value.filter(change => change.status !== 'unchanged'))

const changedCount = computed(() => preview.value?.changes.filter(change => change.status !== 'unchanged').length ?? 0)
const unchangedCount = computed(() => preview.value?.changes.filter(change => change.status === 'unchanged').length ?? 0)
const removedCount = computed(() => preview.value?.changes.filter(change => change.status === 'removed').length ?? 0)
const canApply = computed(() => !!preview.value
  && !preview.value.snapshot.current
  && preview.value.actionableCount > 0
  && preview.value.unsupportedCount === 0)

const loadSnapshots = createSerialLoader(runLoadSnapshots)

async function runLoadSnapshots(preserveSelection: boolean) {
  loading.value = true
  loadError.value = ''
  try {
    snapshots.value = await (send('market/environment-snapshots') ?? Promise.resolve([]))
    const previous = preserveSelection && snapshots.value.some(snapshot => snapshot.id === selectedId.value)
      ? selectedId.value
      : ''
    const target = previous || snapshots.value.find(snapshot => !snapshot.current)?.id || ''
    if (target) await selectSnapshot(target, true)
    else {
      selectedId.value = ''
      preview.value = undefined
    }
  } catch (error) {
    console.error(error)
    loadError.value = t('environment.loadFailed')
    if (hasHistory.value) message.error(t('environment.loadFailedToast'))
  } finally {
    loading.value = false
  }
}

async function selectSnapshot(id: string, force = false) {
  if (!force && id === selectedId.value && preview.value) return
  selectedId.value = id
  showUnchanged.value = false
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
.environment-versions-dialog {
  .environment-state {
    margin: 0;
    padding: 3rem 1rem;
    color: var(--fg3);
    text-align: center;

    &.error {
      color: var(--danger);
    }
  }

  .environment-layout {
    display: grid;
    grid-template-columns: 16rem minmax(0, 1fr);
    height: min(22rem, calc(100vh - 18rem));
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .snapshot-list {
    min-height: 0;
    border-right: 1px solid var(--k-color-border);
  }

  .snapshot-row {
    display: grid;
    gap: 0.125rem;
    width: 100%;
    border: 0;
    border-bottom: 1px solid var(--k-color-divider);
    padding: 0.625rem 0.875rem;
    color: var(--fg1);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--k-hover-bg);
    }

    &.active {
      background: color-mix(in srgb, var(--k-color-primary) 10%, transparent);
    }
  }

  .snapshot-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
  }

  .snapshot-name {
    min-width: 0;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .snapshot-meta {
    color: var(--fg3);
    font-size: 0.8125rem;
  }

  .source-tag {
    flex: 0 0 auto;
    border-radius: 4px;
    padding: 0 0.375rem;
    color: var(--fg3);
    background: var(--k-side-bg);
    font-size: 0.75rem;
    line-height: 1.25rem;

    &.current {
      color: var(--k-color-success);
      background: color-mix(in srgb, var(--k-color-success) 12%, transparent);
    }
  }

  .snapshot-detail {
    min-width: 0;
    min-height: 0;
  }

  .snapshot-detail-view {
    padding: 1rem 1.25rem;
  }

  .preview-header {
    margin-bottom: 0.75rem;
    color: var(--fg2);

    strong {
      color: var(--fg1);
    }

    .blocked {
      color: var(--danger);
    }
  }

  .diff-list {
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .diff-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, auto) 4rem;
    align-items: baseline;
    gap: 0.25rem 1rem;
    margin-top: -1px;
    border-top: 1px solid var(--k-color-divider);
    padding: 0.5rem 0.875rem;

    strong {
      min-width: 0;
      overflow: hidden;
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .diff-versions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    min-width: 0;
    color: var(--fg2);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;

    .version-arrow {
      color: var(--fg3);
    }

    .target {
      color: var(--fg1);
      font-weight: 600;
    }
  }

  .change-status {
    color: var(--fg3);
    font-size: 0.8125rem;
    text-align: right;

    &.upgrade,
    &.added {
      color: var(--k-color-success);
    }

    &.downgrade,
    &.changed {
      color: var(--warning);
    }

    &.removed,
    &.unsupported {
      color: var(--danger);
    }
  }

  .change-reason {
    grid-column: 1 / -1;
    color: var(--fg3);
  }

  .toggle-unchanged {
    margin-top: 0.5rem;
  }

  .change-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .change-stat {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 0.375rem;
    min-width: 0;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    background: var(--k-side-bg);

    strong {
      font-variant-numeric: tabular-nums;
    }

    span {
      color: var(--fg3);
      font-size: 0.8125rem;
    }

    &.upgrade strong,
    &.added strong {
      color: var(--k-color-success);
    }

    &.downgrade strong {
      color: var(--warning);
    }

    &.removed strong {
      color: var(--danger);
    }

    &.empty strong {
      color: var(--fg3);
    }
  }

  .scope-note {
    margin: 1rem 0 0;
    color: var(--fg3);
    font-size: 0.8125rem;
    line-height: 1.6;
  }

}

// Only the lead paragraph loses its top margin. The ones inside k-comment keep both margins,
// which the comment relies on to center its text, and the last comment sits on the footer.
.environment-confirm-dialog {
  .market-dialog-body > p {
    margin-top: 0;
  }

  .k-comment:last-child {
    margin-bottom: 0;
  }
}

@media (max-width: 768px) {
  .environment-versions-dialog {
    .environment-layout {
      grid-template-columns: 1fr;
      height: auto;
    }

    .snapshot-list {
      border-right: 0;
      border-bottom: 1px solid var(--k-color-border);

      .el-scrollbar__wrap {
        max-height: 12rem;
      }
    }

    .snapshot-detail-view {
      padding: 0.875rem;
    }

    .diff-row {
      grid-template-columns: minmax(0, 1fr) auto;

      strong {
        grid-column: 1 / -1;
      }
    }
  }
}
</style>

<template>
  <market-dialog
    v-model="dialogVisible"
    append-to-body
    destroy-on-close
    class="install-history-dialog"
    :title="t('operations.history.title')"
    :width="entries.length ? '960px' : '520px'"
  >
    <empty-state
      v-if="!entries.length"
      :icon="loadError ? 'market-next:inbox' : 'clipboard-list'"
      :title="loading ? t('operations.history.reading') : loadError ? t('operations.history.loadFailedTitle') : t('operations.history.emptyTitle')"
      :description="loading ? '' : loadError || t('operations.history.empty')"
    ></empty-state>

    <div v-else class="history-layout">
      <el-scrollbar class="history-list">
        <button
          v-for="entry in entries"
          :key="entry.id"
          type="button"
          :class="['history-row', { active: entry.id === selectedId }]"
          @click="selectEntry(entry.id)"
        >
          <span class="row-main">
            <span class="row-title">
              {{ historyTitle(entry) }}
              <span :class="['dialog-tag', statusTags[entry.status]]">{{ statusText(entry.status) }}</span>
            </span>
            <span class="row-packages">{{ historyPackages(entry) }}</span>
            <span class="row-meta">
              {{ formatDate(entry.startedAt) }}
              <template v-if="entry.duration != null"> · {{ formatDuration(entry.duration) }}</template>
            </span>
          </span>
        </button>
      </el-scrollbar>

      <el-scrollbar class="history-detail" view-class="history-detail-view" tag="section">
        <div v-if="detailLoading" class="history-state">{{ t('operations.history.readingLog') }}</div>
        <div v-else-if="detailError" class="history-state error">{{ detailError }}</div>
        <template v-else-if="detail">
          <header class="detail-header">
            <div class="detail-title">
              <h3>
                {{ historyTitle(detail) }}
                <span :class="['dialog-tag', statusTags[detail.status]]">{{ statusText(detail.status) }}</span>
              </h3>
              <p>
                {{ formatDate(detail.startedAt) }}
                <template v-if="detail.duration != null"> · {{ formatDuration(detail.duration) }}</template>
              </p>
            </div>
            <el-button size="small" class="copy-log" @click="copyLog">
              <k-icon name="market-next:copy"></k-icon>
              {{ t('operations.history.copyLog') }}
            </el-button>
          </header>

          <dl class="detail-meta">
            <div><dt>{{ t('operations.history.source') }}</dt><dd :title="detail.installEndpoint">{{ detail.installEndpoint ? formatEndpoint(detail.installEndpoint) : t('operations.history.defaultSource') }}</dd></div>
            <div><dt>{{ t('operations.history.logSize') }}</dt><dd>{{ formatSize(detail.size) }}</dd></div>
          </dl>

          <div v-if="detail.changes.length" class="change-list">
            <div v-for="change in detail.changes" :key="change.name" class="change-row">
              <strong :title="change.name">{{ change.name }}</strong>
              <span class="change-versions">
                <span :title="beforeVersion(change)">{{ beforeVersion(change) }}</span>
                <span class="version-arrow">→</span>
                <span class="after" :title="afterVersion(change)">{{ afterVersion(change) }}</span>
              </span>
            </div>
          </div>

          <div class="dialog-caption">{{ t('operations.history.logTitle') }}</div>
          <el-scrollbar ref="logScroll" class="log-content" view-class="log-content-view" tag="pre" max-height="16rem">{{ detail.content }}</el-scrollbar>
          <p v-if="detail.truncated" class="truncated-note">{{ t('operations.history.truncated') }}</p>
        </template>
      </el-scrollbar>
    </div>

    <template #footer>
      <el-button :loading="loading" @click="loadHistory(true)">{{ t('operations.history.refresh') }}</el-button>
      <el-button @click="showInstallHistory = false">{{ t('operations.history.close') }}</el-button>
    </template>
  </market-dialog>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import { message, send } from '@koishijs/client'
import { compare, valid } from 'semver'
import type { InstallHistoryChange, InstallHistoryEntry, InstallLogDetail } from 'koishi-plugin-market-next'
import { createSerialLoader, formatEndpoint, showInstallHistory, useDeferredDialog } from './utils'
import EmptyState from './empty-state.vue'
import { useMarketNextI18n } from '../i18n'
import MarketDialog from './market-dialog.vue'

const { t, locale } = useMarketNextI18n()
const entries = ref<InstallHistoryEntry[]>([])
const selectedId = ref('')
const detail = ref<InstallLogDetail>()
// Left untyped: element-plus is not a direct dependency (it comes with @koishijs/client), so its
// ScrollbarInstance type is not imported, same as the scrollbar ref in market.vue.
const logScroll = ref()
const loading = ref(false)
const detailLoading = ref(false)
const loadError = ref('')
const detailError = ref('')
let detailSerial = 0

const dialogVisible = useDeferredDialog(showInstallHistory, () => loadHistory())

const loadHistory = createSerialLoader(runLoadHistory)

async function runLoadHistory(preserveSelection: boolean) {
  loading.value = true
  loadError.value = ''
  try {
    const result = await (send('market/install-history', 20) ?? Promise.resolve([]))
    entries.value = result ?? []
    const target = preserveSelection && entries.value.some(entry => entry.id === selectedId.value)
      ? selectedId.value
      : entries.value[0]?.id || ''
    if (target) {
      await selectEntry(target, true)
    } else {
      selectedId.value = ''
      detail.value = undefined
    }
  } catch (error) {
    console.error(error)
    loadError.value = t('operations.history.loadFailed')
    if (entries.value.length) message.error(t('operations.history.loadFailedToast'))
  } finally {
    loading.value = false
  }
}

async function selectEntry(id: string, force = false) {
  if (!force && id === selectedId.value && detail.value) return
  selectedId.value = id
  detail.value = undefined
  detailError.value = ''
  detailLoading.value = true
  const serial = ++detailSerial
  try {
    const result = await (send('market/install-history-detail', id) ?? Promise.resolve(undefined))
    if (serial !== detailSerial) return
    if (!result) throw new Error('install log not found')
    detail.value = result
  } catch (error) {
    if (serial !== detailSerial) return
    console.error(error)
    detailError.value = t('operations.history.detailFailed')
  } finally {
    if (serial === detailSerial) detailLoading.value = false
  }
}

// A failed or interrupted operation logs why it stopped at the end.
watch(logScroll, (scroll) => {
  if (scroll && detail.value?.status !== 'success') scroll.setScrollTop(scroll.wrapRef.scrollHeight)
})

async function copyLog() {
  if (!detail.value?.content) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(detail.value.content)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = detail.value.content
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    message.success(t('operations.history.copied'))
  } catch (error) {
    console.error(error)
    message.error(t('operations.history.copyFailed'))
  }
}

const statusTags: Record<InstallHistoryEntry['status'], string> = { success: 'success', error: 'danger', running: 'primary', unknown: '' }

function statusText(status: InstallHistoryEntry['status']) {
  switch (status) {
    case 'running': return t('operations.history.statusRunning')
    case 'success': return t('operations.history.statusSuccess')
    case 'error': return t('operations.history.statusError')
    default: return t('operations.history.statusUnknown')
  }
}

function historyTitle(entry: InstallHistoryEntry) {
  if (!entry.changes.length) return t('operations.history.operation')
  let installed = 0
  let removed = 0
  let updated = 0
  let upgraded = 0
  let downgraded = 0
  for (const change of entry.changes) {
    const before = valid(change.beforeResolved || change.beforeRequest)
    const after = valid(change.afterResolved || change.afterRequest)
    const direction = before && after ? compare(after, before) : 0
    if (!change.beforeRequest && change.afterRequest) installed++
    else if (change.beforeRequest && !change.afterRequest) removed++
    else if (direction > 0) upgraded++
    else if (direction < 0) downgraded++
    else updated++
  }
  const groups = [
    installed && t('operations.history.install', { count: installed }),
    upgraded && t('operations.history.upgrade', { count: upgraded }),
    downgraded && t('operations.history.downgrade', { count: downgraded }),
    updated && t('operations.history.update', { count: updated }),
    removed && t('operations.history.uninstall', { count: removed }),
  ].filter(Boolean)
  if (groups.length === 1) return groups[0]
  return t('operations.history.changed', { count: entry.changes.length })
}

function historyPackages(entry: InstallHistoryEntry) {
  if (!entry.changes.length) return entry.deps
  return entry.changes.map(change => change.name).join(t('common.format.listSeparator'))
}

function beforeVersion(change: InstallHistoryChange) {
  return change.beforeResolved || change.beforeRequest || t('operations.history.notInstalled')
}

function afterVersion(change: InstallHistoryChange) {
  return change.afterResolved || change.afterRequest || t('operations.history.uninstalled')
}

function formatDate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return t('operations.history.unknownTime')
  return new Date(value).toLocaleString(locale.value)
}

function formatDuration(value: number) {
  if (value < 1000) return `${Math.max(0, Math.round(value))} ms`
  if (value < 60000) return t('common.time.seconds', { count: (value / 1000).toFixed(value < 10000 ? 1 : 0) })
  const minutes = Math.floor(value / 60000)
  const seconds = Math.round(value % 60000 / 1000)
  return t('common.time.minutesSeconds', { minutes, seconds })
}

function formatSize(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
</script>

<style lang="scss">
.install-history-dialog {
  .history-state {
    padding: 3rem 1rem;
    color: var(--fg3);
    text-align: center;

    &.error {
      color: var(--danger);
    }
  }

  .history-layout {
    display: grid;
    grid-template-columns: 18rem minmax(0, 1fr);
    height: min(30rem, calc(100vh - 16rem));
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .history-list {
    min-height: 0;
    border-right: 1px solid var(--k-color-border);
  }

  .history-row {
    display: block;
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

  .row-main {
    display: grid;
    gap: 0.125rem;
    min-width: 0;
  }

  .row-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }

  .row-packages,
  .row-meta {
    overflow: hidden;
    color: var(--fg3);
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-packages {
    color: var(--fg2);
  }

  .history-detail {
    min-width: 0;
    min-height: 0;
  }

  .history-detail-view {
    padding: 1rem 1.25rem;
  }

  .detail-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;

    h3 {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
      font-size: inherit;
    }

    p {
      margin: 0.25rem 0 0;
      color: var(--fg3);
      font-size: 0.8125rem;
    }
  }

  .detail-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 2rem;
    margin: 1rem 0;

    div {
      display: flex;
      gap: 0.5rem;
      min-width: 0;
    }

    dt {
      color: var(--fg3);
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
  }

  .change-list {
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .change-row {
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

  .change-versions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--fg2);
    font-variant-numeric: tabular-nums;

    .version-arrow {
      color: var(--fg3);
    }

    .after {
      color: var(--fg1);
      font-weight: 600;
    }
  }

  .copy-log .k-icon {
    width: 0.875rem;
    height: 0.875rem;
    margin-right: 0.25rem;
  }

  .log-content {
    border-radius: 8px;
    background: var(--k-side-bg);
  }

  .log-content-view {
    margin: 0;
    padding: 0.75rem 1rem;
    color: var(--fg2);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.75rem;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .truncated-note {
    margin: 0.75rem 0 0;
    color: var(--fg3);
    font-size: 0.8125rem;
  }

}

@media (max-width: 768px) {
  .install-history-dialog {
    .history-layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto;
      height: auto;
    }

    .history-list {
      border-right: 0;
      border-bottom: 1px solid var(--k-color-border);

      .el-scrollbar__wrap {
        max-height: 14rem;
      }
    }

    .history-detail-view {
      padding: 0.875rem;
    }
  }
}
</style>

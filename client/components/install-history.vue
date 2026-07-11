<template>
  <el-dialog
    v-model="showInstallHistory"
    append-to-body
    destroy-on-close
    :class="['install-history-dialog', modeClass]"
    title="最近操作"
    width="min(1040px, calc(100vw - 24px))"
  >
    <div class="history-toolbar">
      <span>{{ loading ? '正在同步记录……' : `共 ${entries.length} 条记录` }}</span>
      <el-button :loading="loading" :disabled="rollingBack" @click="loadHistory(true)">刷新</el-button>
    </div>

    <div class="history-layout">
      <aside class="history-sidebar">
        <div class="list-heading">
          <span>操作记录</span>
          <span>{{ entries.length }}</span>
        </div>
        <div class="history-list" :class="{ loading }">
          <button
            v-for="entry in entries"
            :key="entry.id"
            type="button"
            :class="['history-row', { active: entry.id === selectedId }]"
            @click="selectEntry(entry.id)"
          >
            <span :class="['status-dot', entry.status]"></span>
            <span class="row-main">
              <span class="row-title">{{ historyTitle(entry) }}</span>
              <span class="row-packages">{{ historyPackages(entry) }}</span>
              <span class="row-meta">
                {{ formatDate(entry.startedAt) }}
                <template v-if="entry.duration != null"> · {{ formatDuration(entry.duration) }}</template>
              </span>
            </span>
            <span :class="['status-label', entry.status]">{{ statusText(entry.status) }}</span>
          </button>

          <div v-if="loading && !entries.length" class="history-state">正在读取操作记录……</div>
          <div v-else-if="loadError && !entries.length" class="history-state error">{{ loadError }}</div>
          <div v-else-if="!entries.length" class="history-state">暂无依赖操作记录</div>
        </div>
      </aside>

      <section class="history-detail">
        <div v-if="detailLoading" class="history-state">正在读取日志……</div>
        <div v-else-if="detailError" class="history-state error">{{ detailError }}</div>
        <template v-else-if="detail">
          <header class="detail-header">
            <div class="detail-title">
              <div class="detail-status">
                <span :class="['status-dot', detail.status]"></span>
                <span :class="['status-label', detail.status]">{{ statusText(detail.status) }}</span>
              </div>
              <h3>{{ historyTitle(detail) }}</h3>
              <p>
                {{ formatDate(detail.startedAt) }}
                <template v-if="detail.duration != null"> · {{ formatDuration(detail.duration) }}</template>
              </p>
            </div>
            <div class="detail-actions">
              <el-button size="small" @click="copyLog">复制日志</el-button>
              <el-popconfirm
                v-if="detail.rollbackAvailable"
                width="300"
                title="将依赖回退到本次更新前的实际版本？该操作不会恢复曾被删除的插件配置。"
                confirm-button-text="确认回退"
                cancel-button-text="取消"
                @confirm="rollback"
              >
                <template #reference>
                  <el-button size="small" type="warning" :loading="rollingBack">回退到上版本</el-button>
                </template>
              </el-popconfirm>
            </div>
          </header>

          <dl class="detail-meta">
            <div><dt>依赖数量</dt><dd>{{ detail.changes.length || '未知' }}</dd></div>
            <div><dt>安装源</dt><dd :title="detail.installEndpoint">{{ formatEndpoint(detail.installEndpoint) }}</dd></div>
            <div><dt>日志大小</dt><dd>{{ formatSize(detail.size) }}</dd></div>
          </dl>

          <section v-if="detail.changes.length" class="versions-section">
            <div class="section-heading">
              <span>版本变更</span>
              <span>{{ detail.changes.length }} 项</span>
            </div>
            <div class="change-list">
              <div v-for="change in detail.changes" :key="change.name" class="change-row">
                <strong :title="change.name">{{ change.name }}</strong>
                <span class="version-value" :title="beforeVersion(change)">{{ beforeVersion(change) }}</span>
                <span class="version-arrow">→</span>
                <span class="version-value after" :title="afterVersion(change)">{{ afterVersion(change) }}</span>
              </div>
            </div>
          </section>

          <p v-if="!detail.rollbackAvailable" class="rollback-note">
            {{ rollbackReasonText(detail.rollbackReason) }}
          </p>
          <p v-if="detail.truncated" class="truncated-note">日志过大，复制内容仅保留开头与末尾。</p>
        </template>
        <div v-else class="history-state">选择一条记录查看日志</div>
      </section>
    </div>

    <template #footer>
      <el-button @click="showInstallHistory = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { message, send, useConfig } from '@koishijs/client'
import type { InstallHistoryChange, InstallHistoryEntry, InstallLogDetail } from 'koishi-plugin-market-next'
import { getFrontendMode } from '../utils'
import { rollbackInstallOperation, showInstallHistory } from './utils'

const config = useConfig()
const modeClass = computed(() => `market-mode-${getFrontendMode(config.value)}`)
const entries = ref<InstallHistoryEntry[]>([])
const selectedId = ref('')
const detail = ref<InstallLogDetail>()
const loading = ref(false)
const detailLoading = ref(false)
const rollingBack = ref(false)
const loadError = ref('')
const detailError = ref('')
let detailSerial = 0

watch(showInstallHistory, (visible) => {
  if (visible) void loadHistory()
})

async function loadHistory(preserveSelection = false) {
  if (loading.value) return
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
    loadError.value = '读取最近操作失败，请检查后端日志。'
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
    detailError.value = '读取日志详情失败，文件可能已被自动清理。'
  } finally {
    if (serial === detailSerial) detailLoading.value = false
  }
}

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
    message.success('日志已复制。')
  } catch (error) {
    console.error(error)
    message.error('复制失败，请手动选择日志文本。')
  }
}

async function rollback() {
  if (!detail.value?.rollbackAvailable || rollingBack.value) return
  rollingBack.value = true
  const id = detail.value.id
  const selfUpdate = detail.value.changes.some(change => change.name === 'koishi-plugin-market-next')
  try {
    await rollbackInstallOperation(id, selfUpdate)
  } finally {
    rollingBack.value = false
  }
}

function statusText(status: InstallHistoryEntry['status']) {
  switch (status) {
    case 'running': return '执行中'
    case 'success': return '成功'
    case 'error': return '失败'
    default: return '状态未知'
  }
}

function rollbackReasonText(reason: InstallHistoryEntry['rollbackReason']) {
  switch (reason) {
    case 'running': return '操作执行中，完成后才能判断是否可回退。'
    case 'not-successful': return '只有成功完成的版本更新支持一键回退。'
    case 'legacy': return '这条旧日志没有保存回退所需的版本信息。'
    case 'unsupported': return '新增安装、卸载或没有实际版本变化的操作不提供一键回退。'
    case 'state-changed': return '依赖已在此后发生变化，为避免覆盖后续修改，不能直接回退。'
    default: return '当前记录不支持一键回退。'
  }
}

function historyTitle(entry: InstallHistoryEntry) {
  if (!entry.changes.length) return '依赖操作'
  let installed = 0
  let removed = 0
  let updated = 0
  for (const change of entry.changes) {
    if (!change.beforeRequest && change.afterRequest) installed++
    else if (change.beforeRequest && !change.afterRequest) removed++
    else updated++
  }
  const groups = [
    installed && `安装 ${installed}`,
    updated && `更新 ${updated}`,
    removed && `卸载 ${removed}`,
  ].filter(Boolean)
  if (groups.length === 1) return `${groups[0]} 个依赖`
  return `变更 ${entry.changes.length} 个依赖`
}

function historyPackages(entry: InstallHistoryEntry) {
  if (!entry.changes.length) return entry.deps
  return entry.changes.map(change => change.name).join('、')
}

function beforeVersion(change: InstallHistoryChange) {
  return change.beforeResolved || change.beforeRequest || '未安装'
}

function afterVersion(change: InstallHistoryChange) {
  return change.afterResolved || change.afterRequest || '已卸载'
}

function formatDate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '时间未知'
  return new Date(value).toLocaleString()
}

function formatDuration(value: number) {
  if (value < 1000) return `${Math.max(0, Math.round(value))} ms`
  if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} 秒`
  const minutes = Math.floor(value / 60000)
  const seconds = Math.round(value % 60000 / 1000)
  return `${minutes} 分 ${seconds} 秒`
}

function formatEndpoint(endpoint?: string) {
  if (!endpoint) return '项目默认源'
  try {
    return new URL(endpoint).host
  } catch {
    return endpoint
  }
}

function formatSize(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
</script>

<style lang="scss">
.install-history-dialog {
  --history-surface: var(--k-card-bg, var(--el-bg-color-overlay, var(--el-bg-color)));
  --history-muted: var(--k-side-bg, var(--el-fill-color-light));
  --history-text: var(--fg1, var(--el-text-color-primary));
  --history-text-muted: var(--fg2, var(--el-text-color-regular));
  --history-border: var(--k-color-border, var(--el-border-color));
  --history-primary: var(--k-color-primary, var(--el-color-primary));
  --history-success: var(--k-color-success, var(--el-color-success));
  --history-danger: var(--k-color-danger, var(--el-color-danger));
  --history-warning: var(--k-color-warning, var(--el-color-warning));

  color: var(--history-text);
  background: var(--history-surface);
  border: 1px solid color-mix(in srgb, var(--history-border) 84%, transparent);

  .el-dialog__title {
    color: var(--history-text);
    font-size: 18px;
    font-weight: 600;
  }

  .el-dialog__header,
  .el-dialog__footer {
    border-color: color-mix(in srgb, var(--history-border) 78%, transparent);
  }

  .el-dialog__header {
    border-bottom: 1px solid color-mix(in srgb, var(--history-border) 78%, transparent);
  }

  .el-dialog__body {
    padding-top: 14px;
  }

  .el-dialog__footer {
    border-top: 1px solid color-mix(in srgb, var(--history-border) 78%, transparent);
  }

  .history-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;

    > span {
      min-width: 0;
      color: var(--history-text-muted);
      font-size: 12px;
      line-height: 1.5;
    }
  }

  .history-layout {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    height: min(470px, calc(100vh - 205px));
    min-height: 360px;
    border: 1px solid var(--history-border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--history-surface);
  }

  .history-sidebar {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--history-border);
    background: color-mix(in srgb, var(--history-muted) 62%, var(--history-surface));
  }

  .list-heading {
    flex: 0 0 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--history-border) 72%, transparent);
    color: var(--history-text-muted);
    font-size: 11px;
    font-weight: 600;

    span:last-child {
      min-width: 22px;
      padding: 2px 6px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--history-primary) 10%, var(--history-surface));
      color: var(--history-primary);
      text-align: center;
    }
  }

  .history-list {
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
  }

  .history-row {
    width: 100%;
    min-height: 82px;
    display: grid;
    grid-template-columns: 9px minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
    padding: 11px 12px;
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--history-border) 68%, transparent);
    border-radius: 0;
    color: var(--history-text);
    background: transparent;
    text-align: left;
    cursor: pointer;

    > .status-dot {
      margin-top: 4px;
    }

    &:hover,
    &:focus-visible {
      background: color-mix(in srgb, var(--history-primary) 7%, var(--history-surface));
      outline: none;
    }

    &.active {
      background: color-mix(in srgb, var(--history-primary) 11%, var(--history-surface));
      box-shadow: inset 3px 0 var(--history-primary);
    }
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--history-text-muted);
    flex: 0 0 auto;

    &.running { background: var(--history-primary); }
    &.success { background: var(--history-success); }
    &.error { background: var(--history-danger); }
  }

  .row-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .row-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
  }

  .row-packages {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--history-text-muted);
    font-size: 11px;
    line-height: 1.4;
  }

  .row-meta {
    color: var(--history-text-muted);
    font-size: 11px;
  }

  .status-label {
    font-size: 11px;
    color: var(--history-text-muted);
    white-space: nowrap;
    line-height: 1.35;

    &.running { color: var(--history-primary); }
    &.success { color: var(--history-success); }
    &.error { color: var(--history-danger); }
  }

  .history-detail {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 18px;
    overflow: hidden;
  }

  .detail-header {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .detail-title {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;

    h3 {
      max-width: 100%;
      margin: 1px 0 0;
      overflow: hidden;
      color: var(--history-text);
      font-size: 16px;
      font-weight: 650;
      line-height: 1.35;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    p {
      margin: 0;
      color: var(--history-text-muted);
      font-size: 11px;
      line-height: 1.45;
    }
  }

  .detail-status {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .detail-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .detail-meta {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 0 0 12px;
    border-radius: 6px;

    > div {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 8px 10px;
      border: 1px solid color-mix(in srgb, var(--history-border) 78%, transparent);
      border-radius: 6px;
      background: color-mix(in srgb, var(--history-muted) 46%, var(--history-surface));
    }

    dt {
      color: var(--history-text-muted);
      font-size: 11px;
    }

    dd {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--history-text);
      font-size: 12px;
      font-weight: 600;
    }
  }

  .versions-section {
    min-height: 0;
    flex: 0 1 230px;
    display: flex;
    flex-direction: column;
    margin-bottom: 12px;
  }

  .section-heading {
    flex: 0 0 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--history-text-muted);
    font-size: 11px;
    font-weight: 600;

    span:last-child {
      font-weight: 400;
    }
  }

  .change-list {
    min-height: 0;
    flex: 1 1 auto;
    overflow-y: auto;
    border: 1px solid color-mix(in srgb, var(--history-border) 82%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--history-muted) 34%, var(--history-surface));
  }

  .change-row {
    display: grid;
    grid-template-columns: minmax(150px, 1fr) minmax(90px, 128px) 16px minmax(90px, 128px);
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 5px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--history-border) 64%, transparent);
    font-size: 11px;

    &:last-child { border-bottom: 0; }
    strong {
      min-width: 0;
      overflow: hidden;
      color: var(--history-text);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .version-value {
    min-width: 0;
    overflow: hidden;
    color: var(--history-text-muted);
    font-family: Consolas, Monaco, 'Andale Mono', monospace;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.after {
      color: var(--history-primary);
    }
  }

  .version-arrow {
    color: color-mix(in srgb, var(--history-text-muted) 64%, transparent);
    text-align: center;
  }

  .rollback-note,
  .truncated-note {
    flex: 0 0 auto;
    margin: 0 0 8px;
    padding: 7px 9px;
    border-radius: 6px;
    color: var(--history-text-muted);
    background: color-mix(in srgb, var(--history-warning) 8%, var(--history-surface));
    border: 1px solid color-mix(in srgb, var(--history-warning) 28%, var(--history-border));
    font-size: 11px;
    line-height: 1.5;
  }

  .history-state {
    margin: auto;
    padding: 24px;
    color: var(--history-text-muted);
    font-size: 13px;
    text-align: center;

    &.error { color: var(--history-danger); }
  }

  &.market-mode-polished {
    border-color: color-mix(in srgb, var(--history-primary) 16%, var(--history-border));
    box-shadow: 0 18px 46px color-mix(in srgb, var(--history-text) 16%, transparent);

    .history-layout {
      border-color: color-mix(in srgb, var(--history-primary) 12%, var(--history-border));
    }

    .history-row.active {
      background: color-mix(in srgb, var(--history-primary) 13%, var(--history-surface));
    }
  }
}

@media (max-width: 720px) {
  .install-history-dialog {
    .el-dialog__body {
      padding: 12px;
    }

    .history-toolbar {
      align-items: flex-start;
    }

    .history-layout {
      grid-template-columns: 1fr;
      grid-template-rows: 150px minmax(0, 1fr);
      height: min(540px, calc(100vh - 200px));
      height: min(540px, calc(100dvh - 200px));
      min-height: 420px;
    }

    .history-sidebar {
      border-right: 0;
      border-bottom: 1px solid var(--history-border);
    }

    .history-detail {
      padding: 10px;
    }

    .detail-header {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .detail-actions {
      width: 100%;
      justify-content: flex-start;
    }

    .change-row {
      grid-template-columns: minmax(0, 1fr) 16px minmax(0, 1fr);
      gap: 4px;
      padding-block: 7px;

      strong {
        grid-column: 1 / -1;
      }

      .version-value.after {
        text-align: left;
      }
    }
  }
}
</style>

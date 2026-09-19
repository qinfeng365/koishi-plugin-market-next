<template>
  <el-dialog
    v-model="open"
    append-to-body
    align-center
    destroy-on-close
    :class="['package-history-dialog', modeClass]"
    :title="t('operations.timeline.title', { name: packageName })"
    width="min(560px, calc(100vw - 24px))"
  >
    <div class="package-history-summary">
      <span>{{ t('operations.timeline.current') }}</span>
      <strong>{{ currentVersionText }}</strong>
    </div>

    <div v-if="loading" class="package-history-state">
      {{ t('operations.timeline.loading') }}
    </div>
    <div v-else-if="error" class="package-history-state error">
      {{ error }}
    </div>
    <div v-else-if="!entries.length" class="package-history-state">
      {{ t('operations.timeline.empty') }}
    </div>
    <div v-else class="package-history-list">
      <button
        v-for="entry in entries"
        :key="entry.id"
        type="button"
        :class="['package-history-entry', { selected: entry.id === selectedId, current: isCurrent(entry) }]"
        @click="selectEntry(entry)"
      >
        <span class="package-history-dot" aria-hidden="true"></span>
        <span class="package-history-entry-main">
          <span class="package-history-version-line">
            <strong>{{ formatVersion(entry.afterVersion) }}</strong>
            <span v-if="isCurrent(entry)" class="package-history-current">
              {{ t('operations.timeline.currentBadge') }}
            </span>
          </span>
          <span class="package-history-meta">
            {{ formatDate(entry.finishedAt ?? entry.startedAt) }}
            <template v-if="entry.beforeVersion">
              · {{ t('operations.timeline.from', { version: formatVersion(entry.beforeVersion) }) }}
            </template>
          </span>
        </span>
        <market-icon v-if="entry.id === selectedId" name="asc" class="package-history-selected-icon"></market-icon>
      </button>
    </div>

    <p class="package-history-note">
      {{ t('operations.timeline.note') }}
    </p>

    <template #footer>
      <el-button @click="open = false">{{ t('operations.timeline.close') }}</el-button>
      <el-button
        type="primary"
        :disabled="!selectedEntry || isCurrent(selectedEntry) || !selectedEntry.afterVersion"
        @click="applySelected"
      >
        {{ t('operations.timeline.useVersion') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { message, send, useConfig } from '@koishijs/client'
import type { InstallPackageHistory, InstallPackageHistoryEntry } from 'koishi-plugin-market-next'
import { getFrontendMode } from '../utils'
import { useMarketNextI18n } from '../i18n'
import MarketIcon from '../market/icons'

const props = defineProps<{
  modelValue: boolean
  packageName: string
  currentVersion?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'select-version': [version: string]
}>()

const config = useConfig()
const { t, locale } = useMarketNextI18n()
const modeClass = computed(() => `market-mode-${getFrontendMode(config.value)}`)
const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
const entries = ref<InstallPackageHistoryEntry[]>([])
const currentVersion = ref('')
const selectedId = ref('')
const loading = ref(false)
const error = ref('')
let loadSerial = 0

const selectedEntry = computed(() => entries.value.find(entry => entry.id === selectedId.value))
const currentVersionText = computed(() => currentVersion.value || props.currentVersion || t('operations.timeline.unknownVersion'))

watch(open, (visible) => {
  if (visible) void loadHistory()
})

async function loadHistory() {
  const serial = ++loadSerial
  loading.value = true
  error.value = ''
  selectedId.value = ''
  try {
    const result = await (send('market/package-history', props.packageName, 24) ?? Promise.resolve(undefined)) as InstallPackageHistory | undefined
    if (serial !== loadSerial) return
    entries.value = result?.entries ?? []
    currentVersion.value = result?.currentVersion ?? ''
  } catch (cause) {
    if (serial !== loadSerial) return
    console.error(cause)
    entries.value = []
    currentVersion.value = ''
    error.value = t('operations.timeline.loadFailed')
  } finally {
    if (serial === loadSerial) loading.value = false
  }
}

function selectEntry(entry: InstallPackageHistoryEntry) {
  if (!entry.afterVersion) return
  selectedId.value = entry.id
}

function isCurrent(entry?: InstallPackageHistoryEntry) {
  return !!entry?.afterVersion && entry.afterVersion === (currentVersion.value || props.currentVersion)
}

function applySelected() {
  const entry = selectedEntry.value
  if (!entry?.afterVersion || isCurrent(entry)) return
  emit('select-version', entry.afterVersion)
  open.value = false
  message.info(t('operations.timeline.added', { version: formatVersion(entry.afterVersion) }))
}

function formatVersion(version: string | null) {
  return version || t('operations.timeline.uninstalled')
}

function formatDate(value: number) {
  if (!value) return t('operations.timeline.unknownTime')
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}
</script>

<style lang="scss">
.package-history-dialog {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--k-color-border, #dcdfe6) 88%, var(--fg1, currentColor) 12%);
  border-radius: 10px;
  color: var(--fg1, var(--el-text-color-primary));
  background: color-mix(in srgb, var(--k-card-bg, var(--el-bg-color)) 90%, var(--k-side-bg, var(--el-bg-color)));

  .el-dialog__header {
    margin: 0;
    padding: 14px 44px 12px 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--k-color-border, #dcdfe6) 82%, transparent);
    background: color-mix(in srgb, var(--k-side-bg, var(--el-bg-color)) 64%, var(--k-card-bg, var(--el-bg-color)));
  }

  .el-dialog__title { color: var(--fg1, var(--el-text-color-primary)); font-weight: 700; }
  .el-dialog__body { padding: 14px 18px 10px; }
  .el-dialog__footer {
    padding: 10px 18px 14px;
    border-top: 1px solid color-mix(in srgb, var(--k-color-border, #dcdfe6) 70%, transparent);
  }

  &.market-mode-polished {
    border-color: color-mix(in srgb, var(--k-color-primary) 24%, var(--k-color-border, #dcdfe6));
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--k-color-primary) 5%, transparent), transparent 46%),
      color-mix(in srgb, var(--k-card-bg, var(--el-bg-color)) 90%, var(--k-side-bg, var(--el-bg-color)));
    box-shadow: 0 20px 58px color-mix(in srgb, var(--fg1, currentColor) 18%, transparent);
  }
}

.package-history-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.8rem;
  color: var(--fg2, var(--el-text-color-regular));
  font-size: 0.82rem;

  strong {
    max-width: 70%;
    overflow: hidden;
    color: var(--fg1, var(--el-text-color-primary));
    font-size: 0.95rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.package-history-list {
  display: grid;
  gap: 0.38rem;
  max-height: min(52vh, 420px);
  overflow: auto;
  padding: 0.15rem 0.2rem 0.15rem 0.05rem;
  scrollbar-width: thin;
}

.package-history-entry {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  min-height: 56px;
  border: 1px solid color-mix(in srgb, var(--k-color-border, #dcdfe6) 68%, transparent);
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
  text-align: left;
  color: var(--fg1, var(--el-text-color-primary));
  background: color-mix(in srgb, var(--k-card-bg, var(--el-bg-color)) 78%, var(--k-side-bg, var(--el-bg-color)));
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover,
  &.selected {
    border-color: color-mix(in srgb, var(--k-color-primary, var(--el-color-primary)) 52%, var(--k-color-border, #dcdfe6));
    background: color-mix(in srgb, var(--k-color-primary, var(--el-color-primary)) 8%, var(--k-card-bg, var(--el-bg-color)));
  }

  &.current { border-left: 3px solid var(--k-color-success, var(--el-color-success)); }
}

.package-history-dot {
  flex: 0 0 auto;
  width: 0.62rem;
  height: 0.62rem;
  border: 2px solid var(--k-color-primary, var(--el-color-primary));
  border-radius: 50%;
  background: var(--k-card-bg, var(--el-bg-color));
}

.package-history-entry-main { display: grid; gap: 0.18rem; min-width: 0; flex: 1 1 auto; }
.package-history-version-line { display: flex; align-items: center; gap: 0.45rem; min-width: 0; }
.package-history-version-line strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.package-history-meta { color: var(--fg2, var(--el-text-color-regular)); font-size: 0.76rem; }
.package-history-current {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 0.1rem 0.4rem;
  color: var(--k-color-success, var(--el-color-success));
  background: color-mix(in srgb, var(--k-color-success, var(--el-color-success)) 12%, transparent);
  font-size: 0.7rem;
}
.package-history-selected-icon { flex: 0 0 auto; width: 0.85rem; height: 0.85rem; color: var(--k-color-primary, var(--el-color-primary)); }
.package-history-note { margin: 0.75rem 0 0; color: var(--fg2, var(--el-text-color-regular)); font-size: 0.78rem; line-height: 1.45; }
.package-history-state { padding: 2.4rem 0.5rem; color: var(--fg2, var(--el-text-color-regular)); text-align: center; }
.package-history-state.error { color: var(--k-color-danger, var(--el-color-danger)); }

@media (max-width: 560px) {
  .package-history-dialog .el-dialog__body { padding: 12px 14px 8px; }
  .package-history-dialog .el-dialog__footer { padding: 9px 14px 12px; }
  .package-history-summary strong { max-width: 58%; }
}
</style>

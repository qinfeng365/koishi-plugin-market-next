<template>
  <market-dialog
    v-model="open"
    append-to-body
    align-center
    destroy-on-close
    class="package-history-dialog"
    :title="t('operations.timeline.title', { name: packageName })"
    width="520px"
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
    <empty-state
      v-else-if="!entries.length"
      icon="market-next:history"
      :title="t('operations.timeline.emptyTitle')"
      :description="t('operations.timeline.empty')"
    ></empty-state>
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

    <p v-if="entries.length" class="package-history-note">
      {{ t('operations.timeline.note') }}
    </p>

    <template #footer>
      <el-button @click="open = false">{{ t('operations.timeline.close') }}</el-button>
      <el-button
        v-if="entries.length"
        type="primary"
        :disabled="!selectedEntry || isCurrent(selectedEntry) || !selectedEntry.afterVersion"
        @click="applySelected"
      >
        {{ t('operations.timeline.useVersion') }}
      </el-button>
    </template>
  </market-dialog>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { message, send } from '@koishijs/client'
import type { InstallPackageHistory, InstallPackageHistoryEntry } from 'koishi-plugin-market-next'
import { useMarketNextI18n } from '../i18n'
import MarketIcon from '../market/icons'
import EmptyState from './empty-state.vue'
import MarketDialog from './market-dialog.vue'

const props = defineProps<{
  modelValue: boolean
  packageName: string
  currentVersion?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'select-version': [version: string]
}>()

const { t, locale } = useMarketNextI18n()
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
  // The dialog is shared by every dependency, so drop what the previous package left behind.
  entries.value = []
  currentVersion.value = ''
  try {
    const result = await (send('market/package-history', props.packageName, 24) ?? Promise.resolve(undefined)) as InstallPackageHistory | undefined
    if (serial !== loadSerial) return
    entries.value = result?.entries ?? []
    currentVersion.value = result?.currentVersion ?? ''
  } catch (cause) {
    if (serial !== loadSerial) return
    console.error(cause)
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
.package-history-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
  border-radius: 8px;
  padding: 0.625rem 0.875rem;
  color: var(--fg2);
  background: var(--k-side-bg);

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--fg1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.package-history-list {
  border: 1px solid var(--k-color-border);
  border-radius: 8px;
  overflow: hidden;
}

.package-history-entry {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  margin-top: -1px;
  border: 0;
  border-top: 1px solid var(--k-color-divider);
  padding: 0.625rem 0.875rem;
  text-align: left;
  color: var(--fg1);
  background: transparent;
  font: inherit;
  cursor: pointer;

  &:hover {
    background: var(--k-hover-bg);
  }

  &.selected {
    background: color-mix(in srgb, var(--k-color-primary) 10%, transparent);
  }
}

.package-history-dot {
  flex: 0 0 auto;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--k-color-border);

  .current & {
    background: var(--k-color-success);
  }

  .selected & {
    background: var(--k-color-primary);
  }
}

.package-history-entry-main {
  display: grid;
  flex: 1 1 auto;
  gap: 0.125rem;
  min-width: 0;
}

.package-history-version-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.package-history-meta {
  color: var(--fg3);
  font-size: 0.8125rem;
}

.package-history-current {
  flex: 0 0 auto;
  border-radius: 4px;
  padding: 0 0.375rem;
  color: var(--k-color-success);
  background: color-mix(in srgb, var(--k-color-success) 12%, transparent);
  font-size: 0.75rem;
  line-height: 1.25rem;
}

.package-history-selected-icon {
  flex: 0 0 auto;
  width: 0.875rem;
  height: 0.875rem;
  color: var(--k-color-primary);
}

.package-history-note {
  margin: 0.75rem 0 0;
  color: var(--fg3);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.package-history-state {
  padding: 2rem 0.5rem;
  color: var(--fg3);
  text-align: center;

  &.error {
    color: var(--danger);
  }
}
</style>

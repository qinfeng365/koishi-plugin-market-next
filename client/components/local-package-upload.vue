<template>
  <section class="local-package-panel" :aria-busy="busy">
    <input
      ref="fileInput"
      class="local-package-input"
      type="file"
      accept=".tgz,application/gzip,application/x-gzip"
      @change="onFileInput"
    >
    <div
      :class="['local-package-dropzone', { dragging, busy, ready: !!preview, failed: !!error }]"
      role="button"
      tabindex="0"
      :aria-disabled="busy"
      @click="openFilePicker"
      @keydown.enter.prevent="openFilePicker"
      @keydown.space.prevent="openFilePicker"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <template v-if="preview">
        <div class="local-package-preview-icon" aria-hidden="true">
          <market-icon name="file-archive"></market-icon>
        </div>
        <div class="local-package-preview-main">
          <div class="local-package-preview-heading">
            <strong>{{ preview.name }}</strong>
            <span class="local-package-operation">
              {{ t(`operations.manual.operation.${preview.operation}`) }}
            </span>
          </div>
          <div class="local-package-version-change">
            <span>{{ preview.currentVersion || t('operations.manual.notInstalled') }}</span>
            <k-icon name="arrow-right"></k-icon>
            <strong>{{ preview.version }}</strong>
          </div>
          <p v-if="preview.description">{{ preview.description }}</p>
          <div class="local-package-meta">
            <span>{{ preview.filename }}</span>
            <span>{{ formatBytes(preview.size) }}</span>
            <span>SHA-256 {{ preview.hash.slice(0, 12) }}</span>
          </div>
        </div>
      </template>
      <template v-else-if="uploading">
        <div class="local-package-upload-icon uploading" aria-hidden="true">
          <k-icon name="market-next:upload"></k-icon>
        </div>
        <strong>{{ t('operations.manual.uploading') }}</strong>
        <span class="local-package-filename">{{ selectedFilename }}</span>
        <el-progress :percentage="uploadProgress" :stroke-width="8" :show-text="false"></el-progress>
        <small>{{ formatBytes(uploadedBytes) }} / {{ formatBytes(selectedSize) }}</small>
      </template>
      <template v-else>
        <div class="local-package-upload-icon" aria-hidden="true">
          <k-icon name="market-next:upload"></k-icon>
        </div>
        <strong>{{ t('operations.manual.dropTitle') }}</strong>
        <span>{{ t('operations.manual.dropHint') }}</span>
        <small>{{ t('operations.manual.dropLimit') }}</small>
      </template>
    </div>

    <p class="local-package-status" aria-live="polite">
      <span v-if="error" class="local-package-error" role="alert">{{ error }}</span>
      <span v-else-if="uploading">{{ t('operations.manual.uploading') }} {{ uploadProgress }}%</span>
    </p>

    <k-comment v-if="preview?.scripts.length" type="warning" class="local-package-script-warning">
      <p>{{ t('operations.manual.scriptWarning', { scripts: preview.scripts.join(', ') }) }}</p>
    </k-comment>
  </section>
</template>

<script lang="ts" setup>
import type { LocalPackageUploadPreview } from 'koishi-plugin-market-next'
import { ref } from 'vue'
import { useMarketNextI18n } from '../i18n'
import MarketIcon from '../market/icons'

const props = defineProps<{
  busy: boolean
  error: string
  preview?: LocalPackageUploadPreview
  selectedFilename: string
  selectedSize: number
  uploadedBytes: number
  uploading: boolean
  uploadProgress: number
}>()

const emit = defineEmits<{
  error: [message: string]
  select: [file: File]
}>()

const { t } = useMarketNextI18n()
const fileInput = ref<HTMLInputElement>()
const dragging = ref(false)
let dragDepth = 0

function openFilePicker() {
  if (props.busy) return
  fileInput.value?.click()
}

function onFileInput(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (file) emit('select', file)
}

function onDragEnter() {
  if (props.busy) return
  dragDepth++
  dragging.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}

function onDrop(event: DragEvent) {
  dragDepth = 0
  dragging.value = false
  if (props.busy) return
  const files = [...(event.dataTransfer?.files ?? [])]
  if (files.length !== 1) {
    emit('error', t('operations.manual.singleFile'))
    return
  }
  emit('select', files[0])
}

function formatBytes(value: number) {
  if (!value) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KiB`
  return `${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MiB`
}
</script>

<style lang="scss" scoped>
.local-package-panel {
  min-width: 0;
}

.local-package-input {
  display: none;
}

.local-package-dropzone {
  min-height: 286px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 28px;
  border: 1.5px dashed color-mix(in srgb, var(--k-text-light) 45%, var(--k-border-color));
  border-radius: 7px;
  color: var(--k-text-light);
  background: color-mix(in srgb, var(--primary) 2.5%, var(--k-card-bg));
  cursor: pointer;
  outline: none;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;

  &:hover,
  &:focus-visible,
  &.dragging {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 7%, var(--k-card-bg));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 18%, transparent);
  }

  &.busy {
    cursor: progress;
  }

  &.ready {
    min-height: 224px;
    flex-direction: row;
    align-items: flex-start;
    justify-content: flex-start;
    text-align: left;
  }

  &.failed {
    border-color: color-mix(in srgb, var(--danger) 65%, var(--k-border-color));
  }

  > strong {
    color: var(--k-text-normal);
    font-size: 15px;
  }

  > small {
    color: var(--k-text-light);
  }

  :deep(.el-progress) {
    width: min(360px, 86%);
  }
}

.local-package-filename {
  max-width: 100%;
  overflow-wrap: anywhere;
  text-align: center;
}

.local-package-upload-icon,
.local-package-preview-icon {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  flex: 0 0 auto;
  border-radius: 50%;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 11%, var(--k-card-bg));
  font-size: 25px;

  &.uploading {
    animation: local-package-upload-pulse 1.2s ease-in-out infinite;
  }
}

.local-package-preview-icon {
  width: 54px;
  height: 54px;
  border-radius: 6px;
}

.local-package-preview-main {
  min-width: 0;
  flex: 1;

  p {
    margin: 12px 0;
    color: var(--k-text-light);
    line-height: 1.6;
  }
}

.local-package-preview-heading,
.local-package-version-change,
.local-package-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.local-package-preview-heading {
  flex-wrap: wrap;

  strong {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--k-text-normal);
    font-size: 16px;
  }
}

.local-package-operation {
  padding: 2px 7px;
  border: 1px solid color-mix(in srgb, var(--primary) 38%, var(--k-border-color));
  border-radius: 999px;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 7%, var(--k-card-bg));
  font-size: 12px;
}

.local-package-version-change {
  margin-top: 10px;
  color: var(--k-text-light);

  strong {
    color: var(--primary);
  }
}

.local-package-meta {
  flex-wrap: wrap;
  color: var(--k-text-light);
  font-size: 12px;

  span {
    overflow-wrap: anywhere;
  }

  span + span::before {
    content: '·';
    margin-right: 8px;
    color: var(--k-border-color);
  }
}

.local-package-status {
  min-height: 21px;
  margin: 8px 0 0;
  color: var(--k-text-light);
  font-size: 12px;
  line-height: 1.5;
}

.local-package-error {
  color: var(--danger);
}

.local-package-script-warning {
  margin-top: 10px;

  p {
    margin: 0;
  }
}

@keyframes local-package-upload-pulse {
  0%, 100% { transform: scale(1); opacity: 0.82; }
  50% { transform: scale(1.06); opacity: 1; }
}

@media (max-width: 560px) {
  .local-package-dropzone {
    min-height: 230px;
    padding: 20px 14px;

    &.ready {
      min-height: 0;
      flex-direction: column;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .local-package-dropzone,
  .local-package-upload-icon {
    transition: none;
    animation: none;
  }
}
</style>

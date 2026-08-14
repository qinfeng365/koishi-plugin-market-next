<template>
  <el-dialog
    v-model="showManual"
    append-to-body
    align-center
    class="manual-panel local-package-dialog"
    destroy-on-close
    width="min(680px, calc(100vw - 24px))"
    :close-on-click-modal="!busy"
    :close-on-press-escape="!busy"
  >
    <template #header>{{ t('operations.manual.title') }}</template>

    <el-tabs v-model="mode" class="manual-tabs">
      <el-tab-pane name="local">
        <template #label>
          <span class="manual-tab-label">
            <market-icon name="file-archive"></market-icon>
            <span>{{ t('operations.manual.localTab') }}</span>
          </span>
        </template>
        <local-package-upload
          :busy="busy"
          :error="uploadError"
          :preview="preview"
          :selected-filename="selectedFilename"
          :selected-size="selectedSize"
          :uploaded-bytes="uploadedBytes"
          :uploading="uploading"
          :upload-progress="uploadProgress"
          @error="setError"
          @select="uploadFile"
        ></local-package-upload>
      </el-tab-pane>

      <el-tab-pane name="registry" :disabled="busy">
        <template #label>
          <span class="manual-tab-label">
            <k-icon name="cube"></k-icon>
            <span>{{ t('operations.manual.registryTab') }}</span>
          </span>
        </template>
        <div class="registry-panel">
          <k-comment type="warning">
            <p>
              {{ t('operations.manual.hint') }}
              <router-link to="/market">{{ t('operations.manual.market') }}</router-link>
              {{ t('operations.manual.hintAfter') }}
            </p>
          </k-comment>
          <el-input
            v-model="name"
            clearable
            :aria-invalid="!!registryError"
            :class="{ invalid: !!registryError }"
            :placeholder="t('operations.manual.placeholder')"
            @keydown.enter.stop.prevent="onRegistryEnter"
          ></el-input>
          <p class="registry-status" aria-live="polite">
            <span v-if="registryLoading">{{ t('operations.manual.registryLoading') }}</span>
            <span v-else-if="registryError" class="error" role="alert">{{ registryError }}</span>
          </p>
          <dl v-if="remote" class="registry-preview">
            <div>
              <dt>{{ t('operations.manual.latest') }}</dt>
              <dd>{{ remote['dist-tags']?.latest }}</dd>
            </div>
            <div>
              <dt>{{ t('operations.manual.description') }}</dt>
              <dd>{{ remote.description || '-' }}</dd>
            </div>
          </dl>
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <div :class="['manual-footer', { 'manual-footer--local': mode === 'local' }]">
        <template v-if="mode === 'local'">
          <el-button v-if="preview || uploadError" :disabled="busy" @click="reset()">
            {{ t('operations.manual.chooseAnother') }}
          </el-button>
          <span class="manual-footer-spacer"></span>
          <el-button :disabled="committing" @click="showManual = false">
            {{ t('operations.manual.cancel') }}
          </el-button>
          <el-button type="primary" :loading="committing" :disabled="!preview || busy" @click="installPackage">
            {{ confirmText }}
          </el-button>
        </template>
        <template v-else>
          <span class="manual-footer-spacer"></span>
          <el-button @click="showManual = false">{{ t('operations.manual.cancel') }}</el-button>
          <el-button type="primary" :disabled="registryInvalid" @click="onRegistryEnter">
            {{ t('operations.manual.confirm') }}
          </el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import type { Registry } from '@koishijs/registry'
import { useDebounceFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import LocalPackageUpload from './local-package-upload.vue'
import MarketIcon from '../market/icons'
import { useLocalPackageUpload } from '../composables/use-local-package-upload'
import { useMarketNextI18n } from '../i18n'
import { getPendingOverrides, patchMarketNextData } from '../utils'
import { addManual, showManual } from './utils'

type ManualMode = 'local' | 'registry'

const { t } = useMarketNextI18n()
const mode = ref<ManualMode>('local')
const name = ref('')
const remote = ref<Registry>()
const registryLoading = ref(false)
const registryError = ref('')
let registryRequest = 0

const {
  busy,
  committing,
  confirmText,
  installPackage,
  preview,
  reset,
  selectedFilename,
  selectedSize,
  setError,
  uploadError,
  uploadFile,
  uploadProgress,
  uploadedBytes,
  uploading,
} = useLocalPackageUpload(t, () => {
  showManual.value = false
})

const registryInvalid = computed(() => {
  const query = name.value.trim()
  return !query
    || registryLoading.value
    || !!registryError.value
    || remote.value?.name !== query
    || !remote.value?.['dist-tags']?.latest
})

const fetchRemote = useDebounceFn(async (query: string, request: number) => {
  try {
    const data = await addManual(query)
    if (request !== registryRequest || query !== name.value.trim()) return
    remote.value = data
  } catch (error) {
    if (request !== registryRequest || query !== name.value.trim()) return
    console.warn(error)
    registryError.value = t('operations.manual.registryLookupFailed')
  } finally {
    if (request === registryRequest) registryLoading.value = false
  }
}, 500)

watch(name, (value) => {
  const query = value.trim()
  const request = ++registryRequest
  remote.value = undefined
  registryError.value = ''
  registryLoading.value = !!query
  if (query) void fetchRemote(query, request)
})

watch(mode, (value, previous) => {
  if (previous === 'local' && value !== 'local') void reset(true)
})

watch(showManual, (visible) => {
  if (visible) return
  void reset(true)
  resetRegistry()
  mode.value = 'local'
})

function onRegistryEnter() {
  if (registryInvalid.value || !remote.value) return
  const packageName = remote.value.name
  const latest = remote.value['dist-tags']?.latest
  if (!latest) return
  const override = getPendingOverrides()
  override[packageName] = latest
  void patchMarketNextData({ override: { ...override } })
  showManual.value = false
}

function resetRegistry() {
  registryRequest++
  name.value = ''
  remote.value = undefined
  registryLoading.value = false
  registryError.value = ''
}
</script>

<style lang="scss" scoped>
.manual-tabs {
  min-width: 0;

  :deep(.el-tabs__header) {
    margin-bottom: 14px;
  }

  :deep(.el-tabs__content) {
    overflow: visible;
  }
}

.manual-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;

  :deep(.market-icon),
  :deep(.k-icon) {
    width: 16px;
    height: 16px;
  }
}

.registry-panel {
  min-width: 0;

  .k-comment {
    margin-top: 0;
  }
}

.registry-status {
  min-height: 21px;
  margin: 7px 0;
  color: var(--k-text-light);
  font-size: 12px;
  line-height: 1.5;

  .error {
    color: var(--danger);
  }
}

.registry-preview {
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--k-border-color);
  border-radius: 6px;
  background: color-mix(in srgb, var(--k-side-bg) 54%, var(--k-card-bg));

  div {
    display: grid;
    grid-template-columns: minmax(90px, auto) minmax(0, 1fr);
    gap: 12px;
  }

  dt {
    color: var(--k-text-light);
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--k-text-normal);
  }
}

.manual-footer {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;

  .el-button + .el-button {
    margin-left: 0;
  }
}

.manual-footer-spacer {
  flex: 1 1 auto;
}

:global(.local-package-dialog) {
  --manual-surface: var(--k-card-bg, var(--el-bg-color-overlay, var(--el-bg-color)));
  --manual-border: var(--k-border-color, var(--el-border-color));
  max-height: calc(100vh - 24px);
  max-height: calc(100dvh - 24px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--manual-border);
  background: var(--manual-surface);
}

:global(.local-package-dialog .el-dialog__header),
:global(.local-package-dialog .el-dialog__footer) {
  flex: 0 0 auto;
}

:global(.local-package-dialog .el-dialog__body) {
  min-height: 0;
  flex: 1 1 auto;
  padding-top: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

:global(.local-package-dialog .el-dialog__footer) {
  border-top: 1px solid color-mix(in srgb, var(--manual-border) 76%, transparent);
}

@media (max-width: 560px) {
  :global(.local-package-dialog) {
    width: calc(100vw - 16px) !important;
    max-height: calc(100dvh - 16px);
    margin: 8px auto;
  }

  :global(.local-package-dialog .el-dialog__header) {
    padding: 12px 42px 10px 14px;
  }

  :global(.local-package-dialog .el-dialog__body) {
    padding: 10px 12px;
  }

  :global(.local-package-dialog .el-dialog__footer) {
    padding: 10px 12px 12px;
  }

  .registry-preview div {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .manual-footer {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));

    .el-button {
      width: 100%;
    }
  }

  .manual-footer--local .el-button--primary {
    grid-column: 1 / -1;
  }

  .manual-footer-spacer {
    display: none;
  }
}
</style>

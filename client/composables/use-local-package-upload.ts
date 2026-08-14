import { Binary, message, send } from '@koishijs/client'
import type {
  LocalPackageUploadCommitResult,
  LocalPackageUploadPreview,
  LocalPackageUploadStartResult,
} from 'koishi-plugin-market-next'
import { computed, onScopeDispose, ref } from 'vue'
import { install } from '../components/utils'

type Translate = (key: string, params?: Record<string, unknown>) => string

export function useLocalPackageUpload(t: Translate, closeDialog: () => void) {
  const uploading = ref(false)
  const committing = ref(false)
  const uploadProgress = ref(0)
  const uploadedBytes = ref(0)
  const selectedSize = ref(0)
  const selectedFilename = ref('')
  const uploadId = ref('')
  const uploadError = ref('')
  const preview = ref<LocalPackageUploadPreview>()
  let uploadGeneration = 0

  const busy = computed(() => uploading.value || committing.value)
  const confirmText = computed(() => {
    if (!preview.value) return t('operations.manual.installLocal')
    return t(`operations.manual.confirmOperation.${preview.value.operation}`, {
      version: preview.value.version,
    })
  })

  async function uploadFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.tgz')) {
      uploadError.value = t('operations.manual.invalidFile')
      return
    }

    await reset(true)
    const generation = ++uploadGeneration
    uploading.value = true
    selectedFilename.value = file.name
    selectedSize.value = file.size
    uploadError.value = ''

    try {
      const started = await send('market/local-package-upload-start', {
        filename: file.name,
        size: file.size,
      }) as LocalPackageUploadStartResult
      if (generation !== uploadGeneration) {
        void cancelUpload(started.uploadId)
        return
      }
      uploadId.value = started.uploadId

      let index = 0
      for (let offset = 0; offset < file.size; offset += started.chunkSize) {
        if (generation !== uploadGeneration) return
        const chunk = await file.slice(offset, Math.min(file.size, offset + started.chunkSize)).arrayBuffer()
        const progress = await send('market/local-package-upload-chunk', {
          uploadId: started.uploadId,
          index,
          data: Binary.toBase64(chunk),
        })
        if (generation !== uploadGeneration) return
        uploadedBytes.value = progress.received
        uploadProgress.value = Math.min(100, Math.round(progress.received / progress.size * 100))
        index++
      }

      const result = await send('market/local-package-upload-finish', {
        uploadId: started.uploadId,
      }) as LocalPackageUploadPreview
      if (generation !== uploadGeneration) return
      preview.value = result
      uploadProgress.value = 100
    } catch (error) {
      if (generation !== uploadGeneration) return
      uploadError.value = formatError(error, t('operations.manual.uploadFailed'))
      const current = uploadId.value
      uploadId.value = ''
      if (current) void cancelUpload(current)
    } finally {
      if (generation === uploadGeneration) uploading.value = false
    }
  }

  async function installPackage() {
    const current = preview.value
    if (!current || committing.value) return
    committing.value = true
    uploadError.value = ''
    try {
      const prepared = await send(
        'market/local-package-upload-commit',
        current.uploadId,
      ) as LocalPackageUploadCommitResult
      uploadId.value = ''
      closeDialog()
      await install({ [prepared.name]: prepared.request }, undefined, true, {
        loadingText: t('operations.manual.installingTitle', { name: prepared.name }),
        successText: t('operations.manual.installSuccess', {
          name: prepared.name,
          version: prepared.version,
        }),
        errorText: t('operations.manual.installFailed', { name: prepared.name }),
      })
    } catch (error) {
      uploadError.value = formatError(error, t('operations.manual.uploadFailed'))
      message.error(uploadError.value)
    } finally {
      committing.value = false
    }
  }

  async function reset(cancel = true) {
    uploadGeneration++
    const current = uploadId.value
    uploadId.value = ''
    preview.value = undefined
    uploadError.value = ''
    uploadProgress.value = 0
    uploadedBytes.value = 0
    selectedSize.value = 0
    selectedFilename.value = ''
    uploading.value = false
    committing.value = false
    if (cancel && current) await cancelUpload(current)
  }

  function setError(value: string) {
    uploadError.value = value
  }

  onScopeDispose(() => {
    void reset(true)
  })

  return {
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
  }
}

async function cancelUpload(uploadId: string) {
  await send('market/local-package-upload-cancel', uploadId).catch(() => {})
}

function formatError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && typeof (error as any).message === 'string') {
    return (error as any).message
  }
  return fallback
}

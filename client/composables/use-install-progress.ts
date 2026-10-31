import { computed, nextTick, ref, watch } from 'vue'
import { useMarketNextI18n } from '../i18n'
import { installProgressState } from '../components/utils'

export function useInstallProgress(native = false) {
  const { t } = useMarketNextI18n()

  // Left untyped for the same reason as the log scrollbar in install-history.vue.
  const viewport = ref()

  const statusText = computed(() => {
    if (installProgressState.environmentRestore) {
      switch (installProgressState.status) {
        case 'running': return t('operations.progress.runningEnvironment')
        case 'success': return t('operations.progress.successEnvironment')
        case 'error': return t('operations.progress.errorEnvironment')
        default: return t('operations.progress.ready')
      }
    }
    const selfUpdateText = installProgressState.selfUpdate
    switch (installProgressState.status) {
      case 'running': return selfUpdateText
        ? t('operations.progress.runningSelf')
        : t('operations.progress.runningDependencies')
      case 'success': return selfUpdateText
        ? t('operations.progress.successSelf')
        : t('operations.progress.successDependencies')
      case 'error': return selfUpdateText
        ? t('operations.progress.errorSelf')
        : t('operations.progress.errorDependencies')
      default: return t('operations.progress.ready')
    }
  })

  watch(() => installProgressState.logs.length, () => {
    nextTick(() => {
      if (!viewport.value) return
      if (native) {
        viewport.value.scrollTop = viewport.value.scrollHeight
      } else {
        viewport.value.setScrollTop(viewport.value.wrapRef.scrollHeight)
      }
    })
  })

  function handleBeforeClose(done: () => void) {
    if (installProgressState.status !== 'running') {
      done()
    }
  }

  function close() {
    installProgressState.visible = false
  }

  function retryFallback() {
    void installProgressState.retryFallback?.()
  }

  return { t, installProgressState, viewport, statusText, handleBeforeClose, close, retryFallback }
}

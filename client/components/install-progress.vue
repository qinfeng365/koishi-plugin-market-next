<template>
  <market-dialog
    v-model="installProgressState.visible"
    append-to-body
    :show-close="installProgressState.status !== 'running'"
    :before-close="handleBeforeClose"
    class="install-progress-dialog"
    :title="installProgressState.title"
    width="760px"
  >
    <p :class="['progress-status', installProgressState.status]">
      <span v-if="installProgressState.status === 'running'" class="progress-spinner" aria-hidden="true"></span>
      {{ statusText }}
    </p>

    <el-scrollbar ref="viewport" class="progress-log" view-class="progress-log-view" :aria-label="t('operations.progress.logTitle')">
      <template v-if="installProgressState.logs.length">
        <div v-for="(log, index) in installProgressState.logs" :key="index" :class="['log-line', log.type]">{{ log.line }}</div>
      </template>
      <div v-else class="log-empty">{{ t('operations.progress.initializing') }}</div>
    </el-scrollbar>

    <p v-if="installProgressState.fallbackCandidate" class="fallback-prompt">
      {{ t('operations.progress.fallbackPrefix') }}
      <strong>{{ installProgressState.fallbackCandidate.label }}</strong>
      {{ t('operations.progress.fallbackSuffix') }}
    </p>

    <template #footer>
      <el-button
        v-if="installProgressState.fallbackCandidate && installProgressState.retryFallback"
        :loading="installProgressState.fallbackRunning"
        :disabled="installProgressState.fallbackRunning"
        @click="retryFallback"
      >
        {{ t('operations.progress.retryFallback') }}
      </el-button>
      <el-button type="primary" :disabled="installProgressState.status === 'running'" @click="close">
        {{ installProgressState.status === 'running' ? t('operations.progress.executing') : t('operations.progress.close') }}
      </el-button>
    </template>
  </market-dialog>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useMarketNextI18n } from '../i18n'
import { installProgressState } from './utils'
import MarketDialog from './market-dialog.vue'

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
    viewport.value.setScrollTop(viewport.value.wrapRef.scrollHeight)
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
</script>

<style lang="scss">
.install-progress-dialog {
  .progress-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.75rem;
    color: var(--fg2);

    &.running {
      color: var(--k-color-primary);
    }

    &.success {
      color: var(--k-color-success);
    }

    &.error {
      color: var(--danger);
    }
  }

  .progress-spinner {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: market-progress-spin 0.8s linear infinite;
  }

  .progress-log {
    height: min(24rem, 50vh);
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    background: var(--k-side-bg);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8125rem;
    line-height: 1.6;
  }

  .progress-log-view {
    padding: 0.75rem 1rem;
  }

  .log-line {
    white-space: pre-wrap;
    overflow-wrap: anywhere;

    &.stderr {
      color: var(--warning);
    }
  }

  .log-empty {
    color: var(--fg3);
  }

  .fallback-prompt {
    margin: 0.75rem 0 0;
    color: var(--fg2);
    line-height: 1.6;
  }
}

@keyframes market-progress-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

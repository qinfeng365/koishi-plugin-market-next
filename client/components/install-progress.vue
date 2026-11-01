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

    <div v-if="installProgressState.status === 'running'" class="progress-track" role="progressbar" :aria-label="statusText">
      <span class="progress-bar"></span>
    </div>

    <p class="progress-caption">
      <span>{{ t('operations.progress.logTitle') }}</span>
      <span v-if="installProgressState.logs.length" class="progress-count">{{ installProgressState.logs.length }}</span>
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
      <el-button v-if="installProgressState.status === 'running'" disabled>
        {{ t('operations.progress.executing') }}
      </el-button>
      <el-button v-else type="primary" @click="close">
        {{ t('operations.progress.close') }}
      </el-button>
    </template>
  </market-dialog>
</template>

<script lang="ts" setup>
import MarketDialog from './market-dialog.vue'
import { useInstallProgress } from '../composables/use-install-progress'

const { t, installProgressState, viewport, statusText, handleBeforeClose, close, retryFallback } = useInstallProgress()
</script>

<style lang="scss">
.install-progress-dialog {
  .progress-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.6rem;
    color: var(--fg2);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.5;

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

  .progress-track {
    height: 2px;
    margin: 0 0 0.75rem;
    border-radius: 2px;
    background: var(--k-color-divider);
    overflow: hidden;
  }

  .progress-bar {
    display: block;
    width: 32%;
    height: 100%;
    border-radius: inherit;
    background: var(--k-color-primary);
    animation: market-progress-slide 1.3s ease-in-out infinite;
  }

  .progress-caption {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0 0 0.35rem;
    color: var(--fg3);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .progress-count {
    padding: 0 0.3rem;
    border-radius: 999px;
    background: var(--k-hover-bg);
    color: var(--fg2);
    font-variant-numeric: tabular-nums;
  }

  .progress-log {
    height: min(18rem, 46vh);
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    background: var(--k-side-bg);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8125rem;
    line-height: 1.6;
  }

  .progress-log-view {
    padding: 0.7rem 0.9rem;
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

@keyframes market-progress-slide {
  from {
    transform: translateX(-100%);
  }

  to {
    transform: translateX(310%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .install-progress-dialog {
    .progress-spinner,
    .progress-bar {
      animation: none;
    }

    .progress-bar {
      width: 100%;
      opacity: 0.55;
    }
  }
}
</style>

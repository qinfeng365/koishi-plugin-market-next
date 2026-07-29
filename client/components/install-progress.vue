<template>
  <el-dialog
    v-model="installProgressState.visible"
    append-to-body
    align-center
    :show-close="installProgressState.status !== 'running'"
    :before-close="handleBeforeClose"
    :class="['market-dialog', 'market-dialog--medium', 'market-dialog--contained', 'install-progress-dialog', modeClass]"
    :title="installProgressState.title"
  >
    <div class="progress-body">
      <!-- Status Banner -->
      <div :class="['status-banner', installProgressState.status]">
        <div class="status-indicator">
          <span v-if="installProgressState.status === 'running'" class="pulse-dot"></span>
          <market-icon v-else-if="installProgressState.status === 'success'" name="verified"></market-icon>
          <span v-else-if="installProgressState.status === 'error'" class="error-cross">×</span>
          <span>{{ statusText }}</span>
        </div>
      </div>

      <!-- Log Terminal -->
      <div class="terminal-container">
        <div class="terminal-header">
          <span class="term-title">{{ t('operations.progress.logTitle') }}</span>
        </div>
        <div class="terminal-viewport" ref="viewport">
          <div class="terminal-content">
            <template v-if="installProgressState.logs.length">
              <div
                v-for="(log, index) in installProgressState.logs"
                :key="index"
                :class="['log-line', log.type]"
              >
                <span class="line-prefix">$</span>
                <span class="line-text">{{ log.line }}</span>
              </div>
            </template>
            <div v-else class="empty-logs">
              <span class="loading-spinner"></span>
              {{ t('operations.progress.initializing') }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <div v-if="installProgressState.fallbackCandidate" class="fallback-prompt">
          {{ t('operations.progress.fallbackPrefix') }}
          <strong>{{ installProgressState.fallbackCandidate.label }}</strong>
          {{ t('operations.progress.fallbackSuffix') }}
        </div>
        <el-button
          v-if="installProgressState.fallbackCandidate && installProgressState.retryFallback"
          type="primary"
          :loading="installProgressState.fallbackRunning"
          :disabled="installProgressState.fallbackRunning"
          @click="retryFallback"
        >
          {{ t('operations.progress.retryFallback') }}
        </el-button>
        <el-button
          :type="installProgressState.status === 'error' ? 'danger' : 'primary'"
          :disabled="installProgressState.status === 'running'"
          @click="close"
        >
          {{ installProgressState.status === 'running' ? t('operations.progress.executing') : t('operations.progress.close') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useConfig } from '@koishijs/client'
import { getFrontendMode } from '../utils'
import { useMarketNextI18n } from '../i18n'
import { installProgressState } from './utils'
import MarketIcon from '../market/icons'

const config = useConfig()
const { t } = useMarketNextI18n()
const frontendMode = computed(() => getFrontendMode(config.value))
const modeClass = computed(() => `market-mode-${frontendMode.value}`)

const viewport = ref<HTMLElement>()

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

// Auto-scroll logs to bottom
watch(() => installProgressState.logs.length, () => {
  nextTick(() => {
    if (!viewport.value) return
    viewport.value.scrollTop = viewport.value.scrollHeight
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
  --progress-surface: var(--market-dialog-surface);
  --progress-surface-muted: var(--market-dialog-surface-muted);
  --progress-text: var(--market-dialog-text);
  --progress-text-muted: var(--market-dialog-text-muted);
  --progress-border-base: var(--market-dialog-border);
  --progress-border: color-mix(in srgb, var(--progress-border-base) 78%, var(--progress-text) 22%);
  --progress-border-soft: color-mix(in srgb, var(--progress-border-base) 76%, transparent);
  --success-color: var(--k-color-success, var(--el-color-success, #10b981));
  --error-color: var(--k-color-danger, var(--el-color-danger, #ef4444));
  --primary-color: var(--k-color-primary, var(--el-color-primary, #3b82f6));
  --status-color: var(--primary-color);
  --status-bg: color-mix(in srgb, var(--status-color) 10%, var(--progress-surface));
  --status-border: color-mix(in srgb, var(--status-color) 34%, var(--progress-border));

  .el-dialog__body {
    display: flex;
    flex-direction: column;
  }

  .progress-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    height: clamp(240px, 54dvh, 430px);
    gap: 0.75rem;
  }

  .dialog-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .fallback-prompt {
    flex: 1 1 18rem;
    min-width: 0;
    color: var(--progress-text-muted);
    font-size: 0.82rem;
    line-height: 1.45;
    text-align: left;

    strong {
      color: var(--primary-color);
      font-weight: 600;
    }
  }

  .status-banner {
    --status-color: var(--primary-color);
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    border: 1px solid var(--status-border);
    background: var(--status-bg);
    color: var(--status-color);
    font-size: 0.85rem;
    font-weight: 500;
    box-shadow: none;
    transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;

    &.running {
      --status-color: var(--primary-color);
    }
    &.success {
      --status-color: var(--success-color);
    }
    &.error {
      --status-color: var(--error-color);
    }
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    .market-icon {
      font-size: 1.1rem;
    }
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    background-color: var(--primary-color);
    border-radius: 50%;
    display: inline-block;
    animation: term-pulse 1.4s infinite ease-in-out;
  }

  .error-cross {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--error-color);
    color: var(--el-color-white, #fff);
    display: grid;
    place-items: center;
    font-size: 0.75rem;
    font-weight: bold;
  }

  .terminal-container {
    background: var(--progress-surface-muted);
    border: 1px solid var(--progress-border);
    border-radius: 8px;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
  }

  .terminal-header {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: color-mix(in srgb, var(--progress-text) 5%, var(--progress-surface-muted));
    border-bottom: 1px solid color-mix(in srgb, var(--progress-border) 84%, transparent);
    flex: 0 0 auto;
  }

  .term-title {
    font-size: 0.72rem;
    color: color-mix(in srgb, var(--progress-text) 64%, transparent);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .terminal-viewport {
    flex: 1 1 auto;
    overflow-y: auto;
  }

  .terminal-content {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--progress-text);
  }

  .log-line {
    word-break: break-all;
    white-space: pre-wrap;

    &.stderr {
      color: var(--error-color);
    }

    .line-prefix {
      color: color-mix(in srgb, var(--progress-text) 42%, transparent);
      margin-right: 0.4rem;
      user-select: none;
    }
  }

  .empty-logs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: color-mix(in srgb, var(--progress-text) 52%, transparent);
    padding: 1rem 0;
  }

  .loading-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
    border-top-color: var(--primary-color);
    border-radius: 50%;
    animation: term-spin 0.7s linear infinite;
  }

  // Styles specific to Polished Mode
  &.market-mode-polished {
    .terminal-header {
      background:
        linear-gradient(90deg, color-mix(in srgb, var(--primary-color) 7%, transparent), transparent 64%),
        color-mix(in srgb, var(--progress-text) 5%, var(--progress-surface-muted));
    }

    .terminal-container {
      border-color: color-mix(in srgb, var(--primary-color) 22%, var(--progress-border));
      box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--progress-text) 7%, transparent),
        0 10px 26px color-mix(in srgb, var(--primary-color) 7%, transparent);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

  }

  // Styles specific to Performance Mode
  &.market-mode-performance {
    .terminal-container {
      box-shadow: none;
    }
  }
}

@media (max-width: 640px) {
  .install-progress-dialog {
    .progress-body {
      height: min(56dvh, 360px);
      min-height: 210px;
    }

    .fallback-prompt {
      flex-basis: 100%;
    }
  }
}

@keyframes term-pulse {
  0%, 100% { transform: scale(0.8); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 1; }
}

@keyframes term-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .install-progress-dialog {
    .pulse-dot,
    .loading-spinner {
      animation: none;
      transform: none;
    }

    .pulse-dot {
      opacity: 0.8;
    }

    .status-banner,
    .terminal-container {
      transition: none;
    }
  }
}
</style>

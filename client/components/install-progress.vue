<template>
  <el-dialog
    v-model="installProgressState.visible"
    append-to-body
    :show-close="installProgressState.status !== 'running'"
    :before-close="handleBeforeClose"
    :class="['install-progress-dialog', modeClass]"
    :title="installProgressState.title"
    width="min(800px, calc(100vw - 24px))"
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
          <span class="term-title">安装日志 / Package Manager Output</span>
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
              正在初始化安装进程并挂载输出……
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button
          :type="installProgressState.status === 'error' ? 'danger' : 'primary'"
          :disabled="installProgressState.status === 'running'"
          @click="close"
        >
          {{ installProgressState.status === 'running' ? '正在执行...' : '关闭' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useConfig } from '@koishijs/client'
import { getFrontendMode } from '../utils'
import { installProgressState } from './utils'
import MarketIcon from '../market/icons'

const config = useConfig()
const frontendMode = computed(() => getFrontendMode(config.value))
const modeClass = computed(() => `market-mode-${frontendMode.value}`)

const viewport = ref<HTMLElement>()

const statusText = computed(() => {
  switch (installProgressState.status) {
    case 'running': return '正在应用依赖变更，请勿关闭页面……'
    case 'success': return '依赖安装成功！控制台正在重载服务。'
    case 'error': return '依赖安装失败，请检查控制台输出。'
    default: return '准备就绪'
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
</script>

<style lang="scss">
.install-progress-dialog {
  --term-bg: var(--k-side-bg, #f8fafc);
  --term-text: var(--fg1, #1e293b);
  --term-border: var(--k-color-border, #e2e8f0);
  --success-color: var(--k-color-success, #10b981);
  --error-color: var(--k-color-danger, #ef4444);
  --primary-color: var(--k-color-primary, #3b82f6);

  border-radius: 12px;
  overflow: hidden;

  .el-dialog__header {
    padding-bottom: 0.5rem;
  }

  .el-dialog__body {
    padding-top: 0.5rem;
    padding-bottom: 1rem;
  }

  .progress-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .status-banner {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    transition: all 0.3s ease;

    &.running {
      background: color-mix(in srgb, var(--primary-color) 10%, var(--k-side-bg, #f8fafc));
      color: var(--primary-color);
      border: 1px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
    }
    &.success {
      background: color-mix(in srgb, var(--success-color) 10%, var(--k-side-bg, #f8fafc));
      color: var(--success-color);
      border: 1px solid color-mix(in srgb, var(--success-color) 25%, transparent);
    }
    &.error {
      background: color-mix(in srgb, var(--error-color) 10%, var(--k-side-bg, #f8fafc));
      color: var(--error-color);
      border: 1px solid color-mix(in srgb, var(--error-color) 25%, transparent);
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
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 0.75rem;
    font-weight: bold;
  }

  .terminal-container {
    background: var(--term-bg);
    border: 1px solid var(--term-border);
    border-radius: 8px;
    height: 360px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
  }

  .terminal-header {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: color-mix(in srgb, var(--term-text) 6%, var(--term-bg));
    border-bottom: 1px solid color-mix(in srgb, var(--term-text) 8%, var(--term-border));
    flex: 0 0 auto;
  }

  .term-title {
    font-size: 0.72rem;
    color: color-mix(in srgb, var(--term-text) 55%, transparent);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
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
    color: var(--term-text);
  }

  .log-line {
    word-break: break-all;
    white-space: pre-wrap;

    &.stderr {
      color: var(--error-color);
    }

    .line-prefix {
      color: color-mix(in srgb, var(--term-text) 40%, transparent);
      margin-right: 0.4rem;
      user-select: none;
    }
  }

  .empty-logs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: color-mix(in srgb, var(--term-text) 45%, transparent);
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
    border-radius: 16px;
    box-shadow: 0 24px 48px rgb(0 0 0 / 22%), 0 8px 16px rgb(0 0 0 / 12%);
    backdrop-filter: blur(12px);

    .terminal-container {
      border-color: color-mix(in srgb, var(--k-color-primary, var(--primary-color)) 25%, var(--term-border));
      box-shadow: inset 0 0 20px color-mix(in srgb, var(--term-text) 10%, transparent), 0 0 15px color-mix(in srgb, var(--k-color-primary, var(--primary-color)) 6%, transparent);
      transition: all 0.3s ease;
    }

    .status-banner {
      backdrop-filter: blur(6px);
    }
  }

  // Styles specific to Performance Mode
  &.market-mode-performance {
    border-radius: 8px;
    box-shadow: none;
    
    .terminal-container {
      box-shadow: none;
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
</style>

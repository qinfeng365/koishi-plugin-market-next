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
        <div v-if="installProgressState.fallbackCandidate" class="fallback-prompt">
          当前源安装失败，是否使用备用源
          <strong>{{ installProgressState.fallbackCandidate.label }}</strong>
          重试一次？不会修改你的配置。
        </div>
        <el-button
          v-if="installProgressState.fallbackCandidate && installProgressState.retryFallback"
          type="primary"
          :loading="installProgressState.fallbackRunning"
          :disabled="installProgressState.fallbackRunning"
          @click="retryFallback"
        >
          使用备用源重试
        </el-button>
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
  const selfUpdateText = installProgressState.selfUpdate
  switch (installProgressState.status) {
    case 'running': return selfUpdateText
      ? '正在更新 market-next，请勿关闭页面……'
      : '正在应用依赖变更，请勿关闭页面……'
    case 'success': return selfUpdateText
      ? 'market-next 更新成功，控制台正在重载。'
      : '依赖安装成功！控制台正在重载服务。'
    case 'error': return selfUpdateText
      ? 'market-next 更新失败，请检查控制台输出。'
      : '依赖安装失败，请检查控制台输出。'
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

function retryFallback() {
  void installProgressState.retryFallback?.()
}
</script>

<style lang="scss">
.install-progress-dialog {
  --progress-surface: var(--k-card-bg, var(--el-bg-color-overlay, var(--el-bg-color, #18181b)));
  --progress-surface-muted: color-mix(in srgb, var(--progress-surface) 84%, var(--k-side-bg, var(--el-fill-color-light, #f8fafc)) 16%);
  --progress-text: var(--fg1, var(--el-text-color-primary, #1e293b));
  --progress-text-muted: var(--fg2, var(--el-text-color-regular, #64748b));
  --progress-border-base: var(--k-color-border, var(--el-border-color, #d4d8e2));
  --progress-border: color-mix(in srgb, var(--progress-border-base) 78%, var(--progress-text) 22%);
  --progress-border-soft: color-mix(in srgb, var(--progress-border-base) 76%, transparent);
  --success-color: var(--k-color-success, var(--el-color-success, #10b981));
  --error-color: var(--k-color-danger, var(--el-color-danger, #ef4444));
  --primary-color: var(--k-color-primary, var(--el-color-primary, #3b82f6));
  --status-color: var(--primary-color);
  --status-bg: color-mix(in srgb, var(--status-color) 10%, var(--progress-surface));
  --status-border: color-mix(in srgb, var(--status-color) 34%, var(--progress-border));

  border-radius: 12px;
  border: 1px solid var(--progress-border);
  color: var(--progress-text);
  background: var(--progress-surface);
  box-shadow: none;
  overflow: hidden;

  .el-dialog__header {
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--progress-border-soft);
    background: color-mix(in srgb, var(--progress-surface-muted) 72%, var(--progress-surface));
  }

  .el-dialog__title {
    color: var(--progress-text);
  }

  .el-dialog__headerbtn {
    .el-dialog__close {
      color: var(--progress-text-muted);
    }

    &:hover .el-dialog__close {
      color: var(--primary-color);
    }
  }

  .el-dialog__body {
    padding-top: 0.5rem;
    padding-bottom: 1rem;
    background: var(--progress-surface);
  }

  .el-dialog__footer {
    border-top: 1px solid var(--progress-border-soft);
    background: color-mix(in srgb, var(--progress-surface) 86%, var(--progress-surface-muted) 14%);
  }

  .progress-body {
    display: flex;
    flex-direction: column;
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
    background: color-mix(in srgb, var(--progress-text) 5%, var(--progress-surface-muted));
    border-bottom: 1px solid color-mix(in srgb, var(--progress-border) 84%, transparent);
    flex: 0 0 auto;
  }

  .term-title {
    font-size: 0.72rem;
    color: color-mix(in srgb, var(--progress-text) 64%, transparent);
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
    border-radius: 16px;
    border-color: color-mix(in srgb, var(--progress-border) 82%, var(--primary-color) 18%);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--primary-color) 5%, transparent), transparent 44%),
      var(--progress-surface);
    box-shadow:
      0 24px 54px color-mix(in srgb, var(--progress-text) 22%, transparent),
      0 8px 18px color-mix(in srgb, var(--primary-color) 8%, transparent),
      0 0 0 1px color-mix(in srgb, var(--primary-color) 10%, transparent) inset;
    backdrop-filter: blur(12px);

    .el-dialog__header {
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--primary-color) 6%, transparent), transparent 68%),
        color-mix(in srgb, var(--progress-surface-muted) 72%, var(--progress-surface));
    }

    .el-dialog__body {
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--primary-color) 2%, transparent), transparent),
        var(--progress-surface);
    }

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

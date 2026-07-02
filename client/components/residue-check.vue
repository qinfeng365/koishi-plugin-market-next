<template>
  <section class="residue-check">
    <div class="residue-head">
      <div>
        <h3>卸载后残留检查</h3>
        <p>基于包名和已安装源码做保守分析，只提示可能残留的数据。</p>
      </div>
      <el-button size="small" :loading="loading" :disabled="!targetNames.length" @click="scan">
        {{ analyses.length ? '重新检查' : '检查残留' }}
      </el-button>
    </div>

    <k-comment v-if="error" type="danger">{{ error }}</k-comment>

    <template v-if="analyses.length">
      <article v-for="item in analyses" :key="item.name" class="residue-package">
        <header>
          <strong>{{ item.name }}</strong>
          <span>{{ item.installed ? '已读取源码' : '未读取源码' }}</span>
        </header>

        <p v-if="!hasFindings(item)" class="residue-empty">未发现明确的残留线索。</p>

        <div v-if="item.directories.length" class="residue-block">
          <h4>疑似文件目录</h4>
          <label v-for="dir in item.directories" :key="dir.path" class="residue-dir">
            <el-checkbox
              v-if="allowCleanup"
              :model-value="!!selected[dir.path]"
              :disabled="!dir.removable"
              @update:model-value="selected[dir.path] = !!$event"
            ></el-checkbox>
            <span class="dir-main">
              <code>{{ dir.relative }}</code>
              <small>
                {{ formatSize(dir.size) }} / {{ dir.files }} 个文件
                <template v-if="dir.truncated">+</template>
                · {{ dir.source === 'source' ? '源码线索' : '包名推测' }}
                <template v-if="dir.modifiedAt"> · {{ formatTime(dir.modifiedAt) }}</template>
              </small>
            </span>
          </label>
        </div>

        <div v-if="item.databaseTables.length" class="residue-block">
          <h4>数据库表线索</h4>
          <div class="residue-tags">
            <code v-for="table in item.databaseTables" :key="table">{{ table }}</code>
          </div>
        </div>

        <div v-if="item.cacheKeys.length" class="residue-block">
          <h4>缓存 key 线索</h4>
          <div class="residue-tags">
            <code v-for="key in item.cacheKeys" :key="key">{{ key }}</code>
          </div>
        </div>

        <div v-if="item.cleanupCommands.length" class="residue-block">
          <h4>疑似清理命令</h4>
          <div class="residue-tags">
            <code v-for="command in item.cleanupCommands" :key="command">{{ command }}</code>
          </div>
        </div>

        <div v-if="item.sourcePaths.length" class="residue-block">
          <h4>源码提到的路径</h4>
          <div class="residue-tags">
            <code v-for="path in item.sourcePaths" :key="path">{{ path }}</code>
          </div>
        </div>

        <k-comment v-for="warning in item.warnings" :key="warning" type="warning">
          {{ warning }}
        </k-comment>
      </article>
    </template>

    <div v-if="allowCleanup && selectedPaths.length" class="residue-actions">
      <span>已选择 {{ selectedPaths.length }} 个目录。</span>
      <el-button size="small" type="danger" :loading="cleaning" @click="cleanup">删除选中目录</el-button>
    </div>
  </section>
</template>

<script setup lang="ts">

import { computed, ref, watch } from 'vue'
import { message, send } from '@koishijs/client'

interface ResidueDirectory {
  path: string
  relative: string
  size: number
  files: number
  modifiedAt?: number
  source: 'name' | 'source'
  removable: boolean
  truncated?: boolean
}

interface ResidueAnalysis {
  name: string
  packageRoot?: string
  installed: boolean
  directories: ResidueDirectory[]
  databaseTables: string[]
  cacheKeys: string[]
  cleanupCommands: string[]
  sourcePaths: string[]
  warnings: string[]
}

const props = withDefaults(defineProps<{
  names: string[]
  allowCleanup?: boolean
}>(), {
  allowCleanup: false,
})

const loading = ref(false)
const cleaning = ref(false)
const error = ref('')
const analyses = ref<ResidueAnalysis[]>([])
const selected = ref<Record<string, boolean>>({})

const targetNames = computed(() => Array.from(new Set((props.names ?? []).filter(Boolean))))
const selectedPaths = computed(() => Object.entries(selected.value)
  .filter(([, value]) => value)
  .map(([path]) => path))

watch(() => targetNames.value.join('\n'), () => {
  analyses.value = []
  selected.value = {}
  error.value = ''
})

async function scan() {
  if (!targetNames.value.length || loading.value) return
  loading.value = true
  error.value = ''
  selected.value = {}
  try {
    analyses.value = await (send('market/analyze-residue', targetNames.value) ?? Promise.resolve([])) as ResidueAnalysis[]
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function cleanup() {
  if (!props.allowCleanup || !selectedPaths.value.length || cleaning.value) return
  cleaning.value = true
  try {
    const result = await (send('market/remove-residue-paths', selectedPaths.value) ?? Promise.resolve(undefined)) as {
      removed: string[]
      failed: Array<{ path: string, error: string }>
    } | undefined
    if (result?.removed.length) message.success(`已删除 ${result.removed.length} 个目录。`)
    if (result?.failed.length) message.warning(`有 ${result.failed.length} 个目录删除失败。`)
    await scan()
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err))
  } finally {
    cleaning.value = false
  }
}

function hasFindings(item: ResidueAnalysis) {
  return item.directories.length
    || item.databaseTables.length
    || item.cacheKeys.length
    || item.cleanupCommands.length
    || item.sourcePaths.length
}

function formatSize(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatTime(value: number) {
  return new Date(value).toLocaleString()
}

</script>

<style lang="scss" scoped>

.residue-check {
  display: grid;
  gap: 0.65rem;
  margin-top: 0.85rem;
  padding: 0.72rem;
  border: 1px solid color-mix(in srgb, var(--confirm-border, var(--k-color-border)) 72%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--confirm-surface-muted, var(--k-card-bg)) 66%, var(--confirm-surface, transparent));
}

.residue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;

  h3 {
    margin: 0;
    font-size: 0.9rem;
  }

  p {
    margin: 0.18rem 0 0;
    color: var(--confirm-text-muted, var(--fg2));
    font-size: 0.78rem;
  }
}

.residue-package {
  display: grid;
  gap: 0.55rem;
  padding: 0.65rem;
  border: 1px solid color-mix(in srgb, var(--confirm-border, var(--k-color-border)) 66%, transparent);
  border-radius: 8px;
  background: var(--confirm-row-bg, var(--k-card-bg));

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;

    span {
      color: var(--confirm-text-muted, var(--fg2));
      font-size: 0.75rem;
    }
  }
}

.residue-empty {
  margin: 0;
  color: var(--confirm-text-muted, var(--fg2));
  font-size: 0.8rem;
}

.residue-block {
  display: grid;
  gap: 0.35rem;

  h4 {
    margin: 0;
    color: var(--confirm-text-muted, var(--fg2));
    font-size: 0.76rem;
    font-weight: 600;
  }
}

.residue-dir {
  display: flex;
  gap: 0.45rem;
  min-width: 0;
  padding: 0.45rem 0.55rem;
  border-radius: 7px;
  background: color-mix(in srgb, var(--confirm-text, currentColor) 4%, transparent);
}

.dir-main {
  display: grid;
  gap: 0.18rem;
  min-width: 0;

  code {
    white-space: normal;
    word-break: break-all;
  }

  small {
    color: var(--confirm-text-muted, var(--fg2));
  }
}

.residue-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;

  code {
    padding: 0.15rem 0.4rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--confirm-text, currentColor) 6%, transparent);
    word-break: break-all;
  }
}

.residue-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;
  color: var(--confirm-text-muted, var(--fg2));
  font-size: 0.78rem;
}

@media (max-width: 640px) {
  .residue-head,
  .residue-actions {
    align-items: stretch;
    flex-direction: column;
  }
}

</style>

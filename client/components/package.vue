<template>
  <article :class="['dep-package-card', statusClass]">
    <div class="dep-card-main">
      <div class="dep-card-header">
        <div class="dep-title">
          <h3 :title="name">{{ displayName }}</h3>
          <span :class="['dep-badge', statusClass]">
            <market-icon :name="statusIcon"></market-icon>
            {{ statusLabel }}
          </span>
        </div>
        <el-button v-if="canModify" size="small" @click="active = name">修改</el-button>
      </div>

      <p :class="['dep-status-text', { danger: statusClass === 'error' }]">{{ detailText }}</p>

      <div class="dep-versions">
        <div class="dep-version-cell">
          <span>当前</span>
          <strong>{{ currentText }}</strong>
        </div>
        <div class="dep-version-arrow" aria-hidden="true">→</div>
        <div class="dep-version-cell">
          <span>{{ pending ? '待应用' : '目标' }}</span>
          <strong :class="{ danger: pendingRemove }">{{ targetText }}</strong>
        </div>
      </div>
    </div>

    <div class="dep-card-actions">
      <el-select
        v-if="data"
        v-model="selectedVersion"
        size="small"
        :class="{ pending }"
      >
        <el-option v-if="dep" :value="removeValue">移除依赖</el-option>
        <el-option v-for="({ result }, itemVersion) in data" :key="itemVersion" :value="itemVersion">
          {{ itemVersion }}
          <template v-if="itemVersion === dep?.resolved">(当前)</template>
          <span :class="[result, 'theme-color', 'dot-hint']"></span>
        </el-option>
      </el-select>
      <span v-else class="dep-muted">{{ compactStatusText }}</span>

      <div class="dep-card-buttons">
        <el-button
          v-if="showQuickUpdate"
          size="small"
          type="primary"
          @click="selectedVersion = latestVersion"
        >
          更新到最新
        </el-button>
        <el-button
          v-if="showConfigure"
          size="small"
          type="primary"
          :loading="configuring"
          @click="configure"
        >
          添加配置
        </el-button>
        <el-button v-if="pending" size="small" @click="clearOverride">取消改动</el-button>
      </div>
    </div>
  </article>
</template>

<script lang="ts" setup>

import { computed, ref } from 'vue'
import { store, useConfig, useContext } from '@koishijs/client'
import { active, hasUpdate } from '../utils'
import { analyzeVersions, ensureInstalledConfig, getRegistryStatus, getRegistryStatusText } from './utils'
import MarketIcon from '../market/icons'

type ItemKind = 'pending' | 'unconfigured' | 'updatable' | 'error' | 'workspace' | 'manual' | 'installed'

const props = defineProps<{
  name: string
  kind?: ItemKind
}>()

const removeValue = '__market_next_remove__'
const config = useConfig()
const ctx = useContext()
const configuring = ref(false)

const dep = computed(() => store.dependencies?.[props.name])
const local = computed(() => store.packages?.[props.name])

const displayName = computed(() => formatPackageDisplayName(props.name))

const data = computed(() => {
  if (dep.value?.workspace || dep.value?.invalid) return
  return analyzeVersions(props.name, (name) => config.value.market.override[name])
})

const status = computed(() => getRegistryStatus(props.name))

const latestVersion = computed(() => {
  const versions = data.value
  if (versions) return Object.keys(versions)[0]
  return dep.value?.latest ?? local.value?.package.version
})

const overrideValue = computed(() => {
  const override = config.value.market.override
  if (!Object.prototype.hasOwnProperty.call(override, props.name)) return
  return override[props.name]
})

const pending = computed(() => overrideValue.value !== undefined)
const pendingRemove = computed(() => pending.value && !overrideValue.value)
const updatable = computed(() => !!hasUpdate(props.name))
const unconfigured = computed(() => {
  return !!ctx.configWriter && !!local.value && isPluginPackage(props.name) && !ctx.configWriter.get(props.name)?.length
})

const selectedVersion = computed({
  get() {
    if (pendingRemove.value) return removeValue
    if (overrideValue.value) return overrideValue.value
    return dep.value?.resolved ?? latestVersion.value ?? ''
  },
  set(value: string) {
    if (value === removeValue) {
      config.value.market.override[props.name] = ''
    } else if (value === dep.value?.resolved || !value && !dep.value) {
      delete config.value.market.override[props.name]
    } else {
      config.value.market.override[props.name] = value
    }
  },
})

const statusClass = computed<ItemKind>(() => {
  if (pending.value) return 'pending'
  if (dep.value?.invalid) return 'error'
  if (dep.value?.workspace) return 'workspace'
  if (unconfigured.value) return 'unconfigured'
  if (status.value?.error) return 'error'
  if (!dep.value && !local.value) return 'manual'
  if (updatable.value) return 'updatable'
  return props.kind ?? 'installed'
})

const statusLabel = computed(() => {
  if (pendingRemove.value) return '待卸载'
  if (pending.value && dep.value) return '待应用'
  if (pending.value) return '待安装'
  if (dep.value?.invalid) return '暂不支持'
  if (dep.value?.workspace) return '工作区'
  if (unconfigured.value) return '未配置'
  if (status.value?.error) return '版本异常'
  if (!dep.value && !local.value) return '手动添加'
  if (updatable.value) return '可更新'
  return '已安装'
})

const statusIcon = computed(() => {
  if (pendingRemove.value) return 'close'
  if (pending.value) return 'tag'
  if (unconfigured.value) return 'preview'
  if (dep.value?.invalid || status.value?.error) return 'insecure'
  if (dep.value?.workspace) return 'file-archive'
  if (!dep.value) return 'search'
  if (updatable.value) return 'asc'
  return 'installed'
})

const currentText = computed(() => {
  if (!dep.value) return local.value?.package.version ?? '未安装'
  if (dep.value.workspace) return dep.value.resolved ? `${dep.value.resolved} / 工作区` : '工作区'
  return dep.value.resolved ?? '安装异常'
})

const targetText = computed(() => {
  if (pendingRemove.value) return '移除依赖'
  if (overrideValue.value) return overrideValue.value
  if (updatable.value && latestVersion.value) return latestVersion.value
  if (dep.value?.workspace) return '保持工作区'
  if (latestVersion.value) return latestVersion.value
  return dep.value || local.value ? '等待版本数据' : '等待安装'
})

const detailText = computed(() => {
  if (pendingRemove.value) return '此依赖将在应用更改后从 package.json 中移除。'
  if (pending.value && dep.value) return '此依赖已有暂存的版本变更，应用后生效。'
  if (pending.value) return '此依赖已加入待安装列表，应用后会安装到本地。'
  if (dep.value?.invalid) return '当前依赖版本区间暂不支持自动判断。'
  if (dep.value?.workspace) return '本地工作区依赖，不参与 npm registry 版本更新。'
  if (unconfigured.value) return '本地已下载，但插件配置页还没有对应配置项。'
  if (status.value?.error) return getRegistryStatusText(props.name)
  if (!data.value && !dep.value?.workspace) return getRegistryStatusText(props.name)
  if (updatable.value && latestVersion.value) return `发现新版本 ${latestVersion.value}。`
  return '当前没有需要处理的版本变更。'
})

const compactStatusText = computed(() => {
  if (dep.value?.workspace) return '工作区依赖'
  if (dep.value?.invalid) return '暂不支持'
  return status.value?.loading || !status.value ? '正在获取版本数据' : '暂无版本数据'
})

const canModify = computed(() => {
  return !!(dep.value?.workspace || data.value)
})

const showQuickUpdate = computed(() => {
  return !pending.value && !unconfigured.value && updatable.value && !!latestVersion.value && !dep.value?.workspace
})

const showConfigure = computed(() => {
  return !pending.value && unconfigured.value
})

function clearOverride() {
  delete config.value.market.override[props.name]
}

function isPluginPackage(name: string) {
  return /^@koishijs\/plugin-[0-9a-z-]+$/.test(name) || /(^|\/)koishi-plugin-[0-9a-z-]+$/.test(name)
}

function formatPackageDisplayName(name: string) {
  const shortname = store.market?.data?.[name]?.shortname
  if (shortname && shortname !== name) return shortname
  if (name.startsWith('@koishijs/plugin-')) return name.slice('@koishijs/plugin-'.length)
  if (name.startsWith('koishi-plugin-')) return name.slice('koishi-plugin-'.length)
  const scoped = name.match(/^@([^/]+)\/koishi-plugin-(.+)$/)
  if (scoped) return `@${scoped[1]}/${scoped[2]}`
  return name
}

async function configure() {
  configuring.value = true
  try {
    await ensureInstalledConfig(ctx, props.name, false)
  } finally {
    configuring.value = false
  }
}

</script>

<style lang="scss" scoped>

.dep-package-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 8.75rem;
  border: 1px solid var(--k-color-border);
  border-radius: 8px;
  padding: 0.7rem 0.82rem 0.78rem;
  background: var(--k-card-bg);
  box-shadow: var(--k-card-shadow);
  overflow: hidden;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;

  &:hover {
    border-color: color-mix(in srgb, currentColor 18%, var(--k-color-border));
    box-shadow: var(--k-card-shadow), 0 6px 18px rgb(0 0 0 / 7%);
    transform: translateY(-1px);
  }

  &::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--fg3);
  }

  &.pending::before {
    background: var(--k-color-primary);
  }

  &.updatable::before {
    background: var(--k-color-success);
  }

  &.error::before {
    background: var(--danger);
  }

  &.workspace::before {
    background: var(--warning);
  }

  &.unconfigured::before {
    background: var(--warning);
  }
}

.dep-card-main {
  min-width: 0;
}

.dep-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.55rem;
}

.dep-title {
  min-width: 0;

  h3 {
    margin: 0;
    font-size: 0.93rem;
    line-height: 1.3;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.dep-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  height: 1.2rem;
  margin-top: 0.25rem;
  border-radius: 6px;
  padding: 0 0.38rem;
  font-size: 0.72rem;
  color: var(--fg2);
  background: var(--k-side-bg);

  .market-icon {
    width: 0.78rem;
    height: 0.78rem;
    flex: 0 0 auto;
  }

  &.pending {
    color: var(--k-color-primary);
  }

  &.updatable {
    color: var(--k-color-success);
  }

  &.error {
    color: var(--danger);
  }

  &.workspace {
    color: var(--warning);
  }

  &.unconfigured {
    color: var(--warning);
  }
}

.dep-status-text {
  min-height: 1.35em;
  margin: 0.45rem 0 0;
  color: var(--fg2);
  font-size: 0.8rem;
  line-height: 1.35;
  overflow-wrap: anywhere;

  &.danger {
    color: var(--danger);
  }
}

.dep-versions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 0.42rem;
  align-items: stretch;
  margin-top: 0.55rem;

  .dep-version-cell {
    min-width: 0;
    border-radius: 6px;
    padding: 0.42rem 0.5rem;
    background: var(--k-side-bg);
  }

  .dep-version-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.15rem;
    color: var(--fg3);
    font-size: 0.85rem;
    font-weight: 600;
  }

  span {
    display: block;
    color: var(--fg2);
    font-size: 0.7rem;
    line-height: 1.3;
  }

  strong {
    display: block;
    margin-top: 0.12rem;
    font-size: 0.84rem;
    line-height: 1.28;
    font-weight: 600;
    overflow-wrap: anywhere;

    &.danger {
      color: var(--danger);
    }
  }
}

.dep-card-actions {
  display: flex;
  gap: 0.45rem;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.62rem;

  .el-select {
    flex: 1 1 auto;
    min-width: 0;
  }
}

.dep-card-buttons {
  display: flex;
  flex: 0 0 auto;
  gap: 0.35rem;
}

.dep-muted {
  min-width: 0;
  color: var(--fg2);
  font-size: 0.8rem;
  line-height: 1.3;
}

@media (max-width: 420px) {
  .dep-card-header, .dep-card-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .dep-card-buttons {
    justify-content: flex-end;
  }

  .dep-versions {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  }
}

</style>

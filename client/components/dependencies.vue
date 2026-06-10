<template>
  <k-layout main="page-deps" menu="dependencies">
    <div class="deps-toolbar">
      <div class="deps-filters">
        <button
          v-for="option in filterOptions"
          :key="option.value"
          :class="['deps-filter', { active: filter === option.value }]"
          @click="filter = option.value"
        >
          <span>{{ option.label }}</span>
          <strong>{{ option.count }}</strong>
        </button>
      </div>
      <div class="deps-search-tools">
        <button
          :class="['deps-filter', 'deps-prerelease-toggle', { active: prereleaseBlocked }]"
          @click="togglePrereleaseFilter"
        >
          <span>屏蔽预览版</span>
          <strong>{{ prereleaseBlocked ? '开' : '关' }}</strong>
        </button>
        <div class="deps-search">
          <el-input ref="searchInput" v-model="keyword" clearable placeholder="搜索依赖名称"></el-input>
        </div>
      </div>
      <div class="deps-summary">
        <span>依赖 {{ summary.total }}</span>
        <span>可更新 {{ summary.updatable }}</span>
        <span>已忽略 {{ summary.ignored }}</span>
        <span>待应用 {{ summary.pending }}</span>
        <span :class="{ warning: summary.unconfigured }">未配置 {{ summary.unconfigured }}</span>
        <span :class="{ danger: summary.errors }">异常 {{ summary.errors }}</span>
        <span v-if="refreshing" class="loading">正在获取版本</span>
      </div>
    </div>

    <el-scrollbar class="body-container">
      <div class="deps-content" :class="{ pending: summary.pending }">
        <template v-if="visibleGroups.length">
          <section v-for="group in visibleGroups" :key="group.key" :class="['deps-group', group.key, { collapsed: group.collapsed }]">
            <header
              :class="['deps-group-header', { collapsible: group.collapsible }]"
              :role="group.collapsible ? 'button' : undefined"
              :tabindex="group.collapsible ? 0 : undefined"
              :aria-expanded="group.collapsible ? String(!group.collapsed) : undefined"
              @click="group.collapsible && toggleGroup(group.key)"
              @keydown.enter.prevent="group.collapsible && toggleGroup(group.key)"
              @keydown.space.prevent="group.collapsible && toggleGroup(group.key)"
            >
              <div>
                <h2>{{ group.label }}</h2>
                <p>{{ group.description }}</p>
              </div>
              <div class="deps-group-side">
                <span class="deps-group-count">{{ group.items.length }}</span>
                <span v-if="group.collapsible" class="deps-group-state">
                  {{ group.collapsed ? '展开' : '折叠' }}
                </span>
              </div>
            </header>
            <div v-if="!group.collapsed" class="deps-grid">
              <package-view
                v-for="item in group.items"
                :key="item.name"
                :name="item.name"
                :kind="item.kind"
              ></package-view>
            </div>
          </section>
        </template>
        <k-empty v-else>没有匹配的依赖。</k-empty>
      </div>
    </el-scrollbar>
  </k-layout>

  <div v-if="summary.pending" class="deps-apply-bar">
    <div>
      <strong>待应用 {{ summary.pending }} 项</strong>
      <span>更改将在确认后写入 package.json 并执行安装流程。</span>
    </div>
    <div class="deps-apply-actions">
      <el-button @click="clearChanges">丢弃改动</el-button>
      <el-button type="primary" @click="showConfirm = true">应用更改</el-button>
    </div>
  </div>

  <manual-install/>
</template>

<script lang="ts" setup>

import { computed, onBeforeUnmount, onMounted, ref, watch, WatchStopHandle } from 'vue'
import { router, store, useConfig, useContext } from '@koishijs/client'
import { getLatestVersion, hasUpdate, isUpdateCheckDisabled, isUpdateIgnored } from '../utils'
import { addManual, getRegistryStatus, showConfirm } from './utils'
import ManualInstall from './manual.vue'
import PackageView from './package.vue'

type FilterKey = 'all' | 'pending' | 'unconfigured' | 'updatable' | 'ignored' | 'error' | 'workspace' | 'manual'
type ItemKind = 'pending' | 'unconfigured' | 'updatable' | 'ignored' | 'error' | 'workspace' | 'manual' | 'installed'

interface DependencyItem {
  name: string
  kind: ItemKind
  pending: boolean
  manual: boolean
}

interface DependencyGroup {
  key: ItemKind
  label: string
  description: string
  items: DependencyItem[]
  collapsed: boolean
  collapsible: boolean
}

const config = useConfig()
const ctx = useContext()
const keyword = ref('')
const filter = ref<FilterKey>('all')
const searchInput = ref<{ focus?: () => void }>()

function getOverride() {
  return config.value.market?.override ?? {}
}

function getCollapsedGroups() {
  if (!config.value.market.collapsedGroups) config.value.market.collapsedGroups = {}
  return config.value.market.collapsedGroups
}

function getUpdatePolicy() {
  return config.value.market ?? {}
}

const names = computed(() => {
  const explicit: Record<string, unknown> = {
    ...(store.dependencies ?? {}),
    ...getOverride(),
  }
  for (const name of Object.keys(store.packages ?? {})) {
    if (isUnconfigured(name)) explicit[name] = true
  }
  return Object
    .keys(explicit)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
})

let dispose: WatchStopHandle
watch(() => store.market?.registry, (registry) => {
  dispose?.()
  if (!registry) return
  dispose = watch(() => config.value.market?.override, (object) => {
    if (!object) return
    Object.keys(object).forEach(async (name) => {
      if (store.dependencies?.[name]) return
      addManual(name)
    })
  }, { immediate: true, deep: true })
}, { immediate: true })

onMounted(() => {
  window.addEventListener('keydown', onSearchShortcut)
})

onBeforeUnmount(() => {
  dispose?.()
  window.removeEventListener('keydown', onSearchShortcut)
})

function onSearchShortcut(event: KeyboardEvent) {
  if (router.currentRoute.value?.path !== '/dependencies') return
  if (event.key.toLowerCase() !== 'k') return
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  searchInput.value?.focus?.()
}

function classify(name: string): ItemKind {
  const dep = store.dependencies?.[name]
  const override = getOverride()
  const pending = Object.prototype.hasOwnProperty.call(override, name)
  if (pending) return 'pending'
  if (!dep) return isUnconfigured(name) ? 'unconfigured' : 'manual'
  if (dep.workspace) return 'workspace'
  if (isUnconfigured(name)) return 'unconfigured'
  const status = getRegistryStatus(name)
  if (status?.error) return 'error'
  if (isUpdateCheckDisabled(name, getUpdatePolicy())) return 'ignored'
  if (isUpdateIgnored(name, getUpdatePolicy())) return 'ignored'
  if (hasUpdate(name, getUpdatePolicy())) return 'updatable'
  return 'installed'
}

function isPluginPackage(name: string) {
  return /^@koishijs\/plugin-[0-9a-z-]+$/.test(name) || /(^|\/)koishi-plugin-[0-9a-z-]+$/.test(name)
}

function isUnconfigured(name: string) {
  return !!ctx.configWriter && !!store.packages?.[name] && isPluginPackage(name) && !ctx.configWriter.get(name)?.length
}

const items = computed<DependencyItem[]>(() => names.value.map(name => ({
  name,
  kind: classify(name),
  pending: Object.prototype.hasOwnProperty.call(getOverride(), name),
  manual: !store.dependencies?.[name] && !store.packages?.[name],
})))

const updates = computed(() => items.value.filter(item => item.kind === 'updatable').map(item => item.name))

const prereleaseBlocked = computed(() => !!config.value.market?.updateIgnorePrerelease)

const summary = computed(() => {
  return {
    total: items.value.length,
    updatable: items.value.filter(item => item.kind === 'updatable').length,
    pending: Object.keys(getOverride()).length,
    unconfigured: items.value.filter(item => item.kind === 'unconfigured').length,
    ignored: items.value.filter(item => item.kind === 'ignored').length,
    errors: items.value.filter(item => item.kind === 'error').length,
    workspace: items.value.filter(item => item.kind === 'workspace').length,
    manual: items.value.filter(item => item.manual).length,
  }
})

const refreshing = computed(() => {
  return Object.values((store as typeof store & { registryStatus?: Record<string, { loading?: boolean }> }).registryStatus ?? {})
    .some(status => status.loading)
})

const filterOptions = computed(() => [
  { value: 'all' as const, label: '全部', count: summary.value.total },
  { value: 'pending' as const, label: '待应用', count: summary.value.pending },
  { value: 'unconfigured' as const, label: '未配置', count: summary.value.unconfigured },
  { value: 'updatable' as const, label: '可更新', count: summary.value.updatable },
  { value: 'ignored' as const, label: '已忽略', count: summary.value.ignored },
  { value: 'error' as const, label: '异常', count: summary.value.errors },
  { value: 'workspace' as const, label: '工作区', count: summary.value.workspace },
  { value: 'manual' as const, label: '手动添加', count: summary.value.manual },
])

const groupMeta: Record<ItemKind, Omit<DependencyGroup, 'items' | 'collapsed' | 'collapsible'>> = {
  pending: {
    key: 'pending',
    label: '待应用',
    description: '这些变更已经暂存，确认后才会真正安装、更新或卸载。',
  },
  updatable: {
    key: 'updatable',
    label: '可更新',
    description: '存在比本地版本更新的 npm 版本。',
  },
  ignored: {
    key: 'ignored',
    label: '已忽略更新',
    description: '已按规则忽略当前更新；达到忽略版本数或到期后会重新提示。',
  },
  unconfigured: {
    key: 'unconfigured',
    label: '已下载未配置',
    description: '依赖已安装到本地，但插件配置页里还没有对应的配置项。',
  },
  error: {
    key: 'error',
    label: '版本异常',
    description: 'npm 元数据暂时不可用，可能是网络、超时或镜像未同步。',
  },
  workspace: {
    key: 'workspace',
    label: '工作区',
    description: '来自当前工作区的本地依赖，不参与远端版本更新。',
  },
  manual: {
    key: 'manual',
    label: '手动添加',
    description: '已加入待安装列表，但当前尚未安装到本地。',
  },
  installed: {
    key: 'installed',
    label: '已安装',
    description: '已安装且当前没有明确需要处理的依赖。',
  },
}

const groupOrder: ItemKind[] = ['pending', 'unconfigured', 'updatable', 'ignored', 'error', 'workspace', 'manual', 'installed']

const collapseEnabled = computed(() => filter.value === 'all' && !keyword.value.trim())

function getDefaultCollapsed(key: ItemKind) {
  return key === 'unconfigured' || key === 'ignored'
}

function isGroupCollapsed(key: ItemKind) {
  if (!collapseEnabled.value) return false
  return getCollapsedGroups()[key] ?? getDefaultCollapsed(key)
}

function toggleGroup(key: ItemKind) {
  getCollapsedGroups()[key] = !isGroupCollapsed(key)
}

const visibleGroups = computed<DependencyGroup[]>(() => {
  const word = keyword.value.trim().toLowerCase()
  const buckets = Object.fromEntries(groupOrder.map(key => [key, [] as DependencyItem[]])) as Record<ItemKind, DependencyItem[]>
  for (const item of items.value) {
    if (filter.value === 'pending' && !item.pending) continue
    if (!item.pending) {
      if (filter.value === 'manual' && !item.manual) continue
      if (!['all', 'pending', 'manual'].includes(filter.value) && item.kind !== filter.value) continue
    }
    if (word && !item.name.toLowerCase().includes(word)) continue
    buckets[item.kind].push(item)
  }
  return groupOrder
    .map(key => ({
      ...groupMeta[key],
      items: buckets[key],
      collapsed: isGroupCollapsed(key),
      collapsible: collapseEnabled.value,
    }))
    .filter(group => group.items.length)
})

function clearChanges() {
  config.value.market.override = {}
}

function togglePrereleaseFilter() {
  config.value.market.updateIgnorePrerelease = !prereleaseBlocked.value
}

ctx.action('dependencies.upgrade', {
  disabled: () => !updates.value.length,
  async action() {
    for (const name of updates.value) {
      const version = getLatestVersion(name, getUpdatePolicy())
      if (!version) continue
      config.value.market.override[name] = version
    }
  },
})

</script>

<style lang="scss">

.page-deps {
  display: flex;
  flex-flow: column;
  min-height: 0;

  .body-container {
    flex: 1 1 auto;
    min-height: 0;
  }

  .k-empty {
    margin-top: 4rem;
  }
}

.deps-toolbar {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
  gap: 0.75rem 1rem;
  padding: 1rem var(--card-margin);
  border-bottom: 1px solid var(--k-color-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--k-side-bg) 56%, transparent), transparent),
    var(--k-card-bg);
}

.deps-search-tools {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-width: 0;
}

.deps-search {
  flex: 1 1 auto;
  min-width: 0;
}

.deps-prerelease-toggle {
  flex: 0 0 auto;
}

.deps-filters {
  display: flex;
  min-width: 0;
  gap: 0.5rem;
  align-items: center;
  overflow-x: auto;
  padding-bottom: 2px;
}

.deps-filter {
  height: 2rem;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0 0.75rem;
  color: var(--fg2);
  background: color-mix(in srgb, var(--k-side-bg) 70%, transparent);
  cursor: pointer;
  white-space: nowrap;
  font-size: 0.85rem;
  transition: color 0.15s, background 0.15s, border-color 0.15s, box-shadow 0.15s;

  &:hover {
    color: var(--fg1);
    background: color-mix(in srgb, var(--k-side-bg) 95%, transparent);
    border-color: color-mix(in srgb, var(--k-color-border) 80%, transparent);
  }

  strong {
    color: var(--fg1);
    font-weight: 700;
    font-size: 0.8rem;
    min-width: 1ch;
    text-align: center;
  }

  &.active {
    color: var(--k-color-primary);
    border-color: color-mix(in srgb, var(--k-color-primary) 45%, transparent);
    background: color-mix(in srgb, var(--k-color-primary) 12%, var(--k-card-bg));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--k-color-primary) 20%, transparent) inset;

    strong { color: var(--k-color-primary); }
  }
}

.deps-summary {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  color: var(--fg2);
  font-size: 0.875rem;

  span {
    display: inline-flex;
    align-items: center;
    height: 1.5rem;
    border: 1px solid color-mix(in srgb, var(--k-color-border) 68%, transparent);
    border-radius: 6px;
    padding: 0 0.5rem;
    background: color-mix(in srgb, var(--k-side-bg) 84%, transparent);
  }

  .danger {
    color: var(--danger);
  }

  .warning {
    color: var(--warning);
  }

  .loading {
    color: var(--k-color-primary);
  }
}

.deps-content {
  padding: 0.75rem var(--card-margin);
  padding-bottom: var(--card-margin);

  &.pending {
    padding-bottom: 5.5rem;
  }
}

.deps-group + .deps-group {
  margin-top: 1rem;
}

.deps-group {
  --group-accent: var(--fg3);

  &.pending {
    --group-accent: var(--k-color-primary);
  }

  &.updatable {
    --group-accent: var(--k-color-success);
  }

  &.ignored {
    --group-accent: var(--fg3);
  }

  &.unconfigured, &.workspace {
    --group-accent: var(--warning);
  }

  &.error {
    --group-accent: var(--danger);
  }

  &.manual {
    --group-accent: var(--k-color-primary);
  }

  &.collapsed .deps-group-header {
    margin-bottom: 0;
  }
}

.deps-group-header {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.45rem;
  border: 1px solid color-mix(in srgb, var(--k-color-border) 70%, transparent);
  border-radius: 8px;
  padding: 0.46rem 0.62rem 0.5rem 0.78rem;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--group-accent) 8%, transparent), transparent 38%),
    color-mix(in srgb, var(--k-card-bg) 76%, transparent);
  overflow: hidden;

  &.collapsible {
    cursor: pointer;
    user-select: none;

    &:hover, &:focus-visible {
      border-color: color-mix(in srgb, var(--group-accent) 32%, var(--k-color-border));
      background:
        linear-gradient(90deg, color-mix(in srgb, var(--group-accent) 12%, transparent), transparent 42%),
        color-mix(in srgb, var(--k-card-bg) 84%, transparent);
      outline: none;
    }
  }

  &::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--group-accent);
  }

  h2 {
    margin: 0;
    font-size: 0.96rem;
    line-height: 1.4;
    font-weight: 600;
  }

  p {
    margin: 0.125rem 0 0;
    color: var(--fg2);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .deps-group-side {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .deps-group-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.75rem;
    height: 1.45rem;
    border: 1px solid color-mix(in srgb, var(--group-accent) 24%, var(--k-color-border));
    border-radius: 999px;
    padding: 0 0.45rem;
    color: var(--group-accent);
    background: color-mix(in srgb, var(--group-accent) 9%, var(--k-card-bg));
    font-size: 0.8rem;
    font-weight: 600;
  }

  .deps-group-state {
    height: 1.45rem;
    border: 1px solid color-mix(in srgb, var(--k-color-border) 76%, transparent);
    border-radius: 999px;
    padding: 0 0.5rem;
    color: var(--fg2);
    background: color-mix(in srgb, var(--k-side-bg) 80%, transparent);
    font-size: 0.76rem;
  }
}

.deps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  align-items: start;
  gap: 0.5rem;
}

.deps-apply-bar {
  position: fixed;
  left: calc(var(--activity-width, 4rem) + var(--aside-width, 0px));
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem var(--card-margin);
  border-top: 1px solid var(--k-color-border);
  background: var(--k-card-bg);
  box-shadow: 0 -6px 18px rgb(0 0 0 / 8%);

  strong {
    display: block;
    line-height: 1.4;
  }

  span {
    color: var(--fg2);
    font-size: 0.875rem;
  }
}

.deps-apply-actions {
  display: flex;
  gap: 0.5rem;
  flex: 0 0 auto;
}

@media (max-width: 768px) {
  .deps-toolbar {
    grid-template-columns: 1fr;
  }

  .deps-search-tools {
    justify-self: stretch;
  }

  .deps-summary {
    grid-column: auto;
  }

  .deps-grid {
    grid-template-columns: 1fr;
  }

  .deps-apply-bar {
    left: 0;
    align-items: stretch;
    flex-direction: column;
  }

  .deps-apply-actions {
    justify-content: flex-end;
  }
}

</style>

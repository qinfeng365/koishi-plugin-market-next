<template>
  <k-layout main="page-deps" :class="[modeClass, layoutClass]" menu="dependencies">
    <div class="deps-toolbar">
      <div class="deps-toolbar-row">
        <el-select v-model="filter" size="small" class="deps-filter-select">
          <el-option
            v-for="option in filterOptions"
            :key="option.value"
            :value="option.value"
            :label="option.label + (option.count ? ' (' + option.count + ')' : '')"
          ></el-option>
        </el-select>
        <button
          :class="['deps-filter', 'deps-prerelease-toggle', { active: prereleaseBlocked }]"
          @click="togglePrereleaseFilter"
        >
          <market-icon name="tag"></market-icon>
          <span>屏蔽预览</span>
        </button>
        <div class="deps-search">
          <el-input ref="searchInput" v-model="keyword" clearable placeholder="搜索依赖名称"></el-input>
        </div>
        <div class="deps-summary">
          <span v-if="summary.pending" class="primary">待 {{ summary.pending }}</span>
          <span v-if="summary.updatable" class="success">更 {{ summary.updatable }}</span>
          <span v-if="summary.unconfigured" class="warning">配 {{ summary.unconfigured }}</span>
          <span v-if="summary.errors" class="danger">误 {{ summary.errors }}</span>
          <span v-if="summary.invalid" class="warning">无效 {{ summary.invalid }}</span>
          <span v-if="refreshing" class="loading">获取中</span>
        </div>
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
                <market-icon
                  v-if="group.collapsible"
                  :class="['deps-group-chevron', { collapsed: group.collapsed }]"
                  name="asc"
                ></market-icon>
              </div>
            </header>
            <div v-if="!group.collapsed" class="deps-grid">
              <template v-if="depsLayout === 'list'">
                <div class="deps-list-header">
                  <span class="col-icon"></span>
                  <span class="col-name">名称</span>
                  <span class="col-version">已安装</span>
                  <span class="col-latest">最新</span>
                  <span class="col-actions">操作</span>
                </div>
              </template>
              <package-view
                v-for="item in group.items"
                :key="item.name"
                :name="item.name"
                :kind="item.kind"
                :list-mode="depsLayout === 'list'"
              ></package-view>
            </div>
          </section>
        </template>
        <k-empty v-else>没有匹配的依赖。</k-empty>
      </div>
    </el-scrollbar>
  </k-layout>

  <div v-if="summary.pending" :class="['deps-apply-bar', modeClass]">
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
import { getFrontendMode, getDepsLayout, getLatestVersion, hasUpdate, isUpdateCheckDisabled, isUpdateIgnored } from '../utils'
import { addManual, getRegistryStatus, showConfirm } from './utils'
import ManualInstall from './manual.vue'
import PackageView from './package.vue'

type FilterKey = 'all' | 'pending' | 'unconfigured' | 'updatable' | 'ignored' | 'check-disabled' | 'invalid' | 'error' | 'workspace' | 'manual'
type ItemKind = 'pending' | 'unconfigured' | 'updatable' | 'ignored' | 'check-disabled' | 'invalid' | 'error' | 'workspace' | 'manual' | 'installed'

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
const frontendMode = computed(() => getFrontendMode(config.value))
const depsLayout = computed(() => getDepsLayout(config.value))
const modeClass = computed(() => `market-mode-${frontendMode.value}`)
const layoutClass = computed(() => `deps-layout-${depsLayout.value}`)

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
  if (dep.invalid) return 'invalid'
  if (isUnconfigured(name)) return 'unconfigured'
  const status = getRegistryStatus(name)
  if (status?.error) return 'error'
  if (isUpdateCheckDisabled(name, getUpdatePolicy())) return 'check-disabled'
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
    checkDisabled: items.value.filter(item => item.kind === 'check-disabled').length,
    invalid: items.value.filter(item => item.kind === 'invalid').length,
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
  { value: 'check-disabled' as const, label: '不检测', count: summary.value.checkDisabled },
  { value: 'invalid' as const, label: '不支持', count: summary.value.invalid },
  { value: 'error' as const, label: '版本异常', count: summary.value.errors },
  { value: 'workspace' as const, label: '工作区', count: summary.value.workspace },
  { value: 'manual' as const, label: '手动添加', count: summary.value.manual },
])

const groupMeta: Record<ItemKind, Omit<DependencyGroup, 'items' | 'collapsed' | 'collapsible'>> = {
  pending: { key: 'pending', label: '待应用', description: '这些变更已经暂存，确认后才会真正安装、更新或卸载。' },
  updatable: { key: 'updatable', label: '可更新', description: '存在比本地版本更新的 npm 版本。' },
  ignored: { key: 'ignored', label: '已忽略更新', description: '已按规则忽略当前更新；达到忽略版本数或到期后会重新提示。' },
  'check-disabled': { key: 'check-disabled', label: '不检测更新', description: '已加入永久不检测更新名单，不会收到版本提示。' },
  unconfigured: { key: 'unconfigured', label: '已下载未配置', description: '依赖已安装到本地，但插件配置页里还没有对应的配置项。' },
  invalid: { key: 'invalid', label: '不支持', description: '当前依赖版本区间语法暂不支持自动版本管理，需手动处理。' },
  error: { key: 'error', label: '版本异常', description: 'npm 元数据暂时不可用，可能是网络、超时或镜像未同步。' },
  workspace: { key: 'workspace', label: '工作区', description: '来自当前工作区的本地依赖，不参与远端版本更新。' },
  manual: { key: 'manual', label: '手动添加', description: '已加入待安装列表，但当前尚未安装到本地。' },
  installed: { key: 'installed', label: '已安装', description: '已安装且当前没有明确需要处理的依赖。' },
}

const groupOrder: ItemKind[] = ['pending', 'unconfigured', 'updatable', 'ignored', 'check-disabled', 'invalid', 'error', 'workspace', 'manual', 'installed']

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
  padding: 0.6rem var(--card-margin);
  border-bottom: 1px solid var(--k-color-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--k-side-bg) 56%, transparent), transparent),
    var(--k-card-bg);
}

.deps-toolbar-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.deps-filter-select {
  flex: 0 0 auto;
  width: 8rem;
}

.deps-search {
  flex: 1 1 auto;
  min-width: 0;
}

.deps-prerelease-toggle {
  flex: 0 0 auto;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0 0.65rem;
  color: var(--fg2);
  background: color-mix(in srgb, var(--k-side-bg) 70%, transparent);
  cursor: pointer;
  white-space: nowrap;
  font-size: 0.83rem;
  transition: color 0.15s, background 0.15s, border-color 0.15s;

  .market-icon { width: 0.85rem; height: 0.85rem; flex: 0 0 auto; }

  &:hover {
    color: var(--fg1);
    background: color-mix(in srgb, var(--k-side-bg) 95%, transparent);
    border-color: color-mix(in srgb, var(--k-color-border) 80%, transparent);
  }

  &.active {
    color: var(--k-color-primary);
    border-color: color-mix(in srgb, var(--k-color-primary) 45%, transparent);
    background: color-mix(in srgb, var(--k-color-primary) 12%, var(--k-card-bg));
  }
}

.deps-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  flex: 0 0 auto;

  span {
    display: inline-flex;
    align-items: center;
    height: 1.4rem;
    border-radius: 5px;
    padding: 0 0.4rem;
    font-size: 0.75rem;
    font-weight: 500;
    background: color-mix(in srgb, var(--k-side-bg) 84%, transparent);
    border: 1px solid color-mix(in srgb, var(--k-color-border) 60%, transparent);
    color: var(--fg2);

    &.primary { color: var(--k-color-primary); background: color-mix(in srgb, var(--k-color-primary) 10%, transparent); border-color: color-mix(in srgb, var(--k-color-primary) 25%, transparent); }
    &.success { color: var(--k-color-success); background: color-mix(in srgb, var(--k-color-success) 10%, transparent); border-color: color-mix(in srgb, var(--k-color-success) 25%, transparent); }
    &.warning { color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, transparent); border-color: color-mix(in srgb, var(--warning) 25%, transparent); }
    &.danger  { color: var(--danger);  background: color-mix(in srgb, var(--danger)  10%, transparent); border-color: color-mix(in srgb, var(--danger)  25%, transparent); }
    &.loading { color: var(--k-color-primary); font-style: italic; }
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

  &.pending  { --group-accent: var(--k-color-primary); }
  &.updatable { --group-accent: var(--k-color-success); }
  &.ignored, &.check-disabled { --group-accent: var(--fg3); }
  &.unconfigured, &.workspace { --group-accent: var(--warning); }
  &.invalid  { --group-accent: var(--warning); }
  &.error    { --group-accent: var(--danger); }
  &.manual   { --group-accent: var(--k-color-primary); }

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

  .deps-group-chevron {
    width: 1rem;
    height: 1rem;
    color: var(--fg3);
    transition: transform 0.2s ease;
    transform: rotate(180deg);

    &.collapsed {
      transform: rotate(0deg);
    }
  }
}

.deps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  align-items: start;
  gap: 0.5rem;
}

.deps-layout-list .deps-grid {
  --deps-list-columns: 2rem minmax(14rem, 1fr) 8rem 9rem 24rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--k-color-border) 70%, transparent);
  border-radius: 8px;
  overflow: hidden;
}

.deps-list-header {
  display: grid;
  grid-template-columns: var(--deps-list-columns);
  column-gap: 0.5rem;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 0.28rem 0.75rem 0.28rem 0.62rem;
  background: color-mix(in srgb, var(--k-side-bg) 70%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--k-color-border) 60%, transparent);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--fg3);
  text-transform: uppercase;

  .col-icon { width: 2rem; }
  .col-name  { min-width: 0; }
  .col-version, .col-latest { min-width: 0; padding: 0 0.25rem; }
  .col-actions { min-width: 0; text-align: right; }
}

@media (max-width: 960px) {
  .deps-layout-list .deps-grid {
    --deps-list-columns: 2rem minmax(10rem, 1fr) 6.5rem 7rem 14rem;
  }
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

.market-mode-polished .page-deps,
.market-mode-polished.page-deps,
.page-deps.market-mode-polished {
  --deps-polished-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --deps-polished-ease-back: cubic-bezier(0.34, 1.8, 0.64, 1);
  --deps-polished-glass: color-mix(in srgb, var(--k-card-bg) 78%, transparent);
  --deps-polished-shadow: 0 24px 56px rgb(0 0 0 / 22%), 0 8px 20px rgb(0 0 0 / 12%), inset 0 1px 0 rgb(255 255 255 / 10%);

  // scrollbar
  .el-scrollbar__bar.is-vertical .el-scrollbar__thumb {
    background: color-mix(in srgb, var(--k-color-primary) 28%, var(--el-scrollbar-bg-color, rgba(144, 147, 153, 0.3)));
    transition: background 0.2s var(--deps-polished-ease);
    &:hover { background: color-mix(in srgb, var(--k-color-primary) 55%, var(--el-scrollbar-hover-bg-color, rgba(144, 147, 153, 0.5))); }
  }

  .deps-toolbar {
    border-bottom-color: color-mix(in srgb, var(--k-color-primary) 16%, var(--k-color-border));
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--k-color-primary) 7%, transparent), transparent 58%),
      var(--deps-polished-glass);
    box-shadow: 0 10px 30px rgb(0 0 0 / 8%);
    backdrop-filter: blur(14px) saturate(1.12);
  }

  .deps-prerelease-toggle,
  .deps-summary span {
    border-color: color-mix(in srgb, var(--k-color-border) 64%, transparent);
    background: color-mix(in srgb, var(--k-side-bg) 72%, transparent);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 5%);
    transition: color 0.18s var(--deps-polished-ease), background 0.18s var(--deps-polished-ease), border-color 0.18s var(--deps-polished-ease), box-shadow 0.18s var(--deps-polished-ease), transform 0.18s var(--deps-polished-ease);
  }

  .deps-prerelease-toggle:hover {
    border-color: color-mix(in srgb, var(--k-color-primary) 40%, var(--k-color-border));
    background: color-mix(in srgb, var(--k-card-bg) 92%, transparent);
    box-shadow: 0 8px 20px rgb(0 0 0 / 12%);
    transform: translateY(-2px);
  }

  .deps-prerelease-toggle.active {
    box-shadow: 0 10px 24px color-mix(in srgb, var(--k-color-primary) 18%, transparent), inset 0 1px 0 rgb(255 255 255 / 10%);
  }

  .deps-group {
    animation: deps-polished-enter 0.45s var(--deps-polished-ease) both;
  }

  .deps-group-header {
    border-color: color-mix(in srgb, var(--group-accent) 22%, var(--k-color-border));
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--group-accent) 12%, transparent), transparent 48%),
      var(--deps-polished-glass);
    box-shadow: 0 6px 18px rgb(0 0 0 / 8%), inset 0 1px 0 rgb(255 255 255 / 8%);
    backdrop-filter: blur(12px) saturate(1.12);
    transition:
      border-color 0.28s var(--deps-polished-ease),
      background 0.28s var(--deps-polished-ease),
      box-shadow 0.28s var(--deps-polished-ease),
      transform 0.28s var(--deps-polished-ease-back);

    h2 {
      background: linear-gradient(90deg, var(--group-accent), color-mix(in srgb, var(--group-accent) 55%, var(--fg1)));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    p { opacity: 0.75; }

    &::before {
      width: 4px;
      border-radius: 0 2px 2px 0;
      box-shadow: 0 0 8px color-mix(in srgb, var(--group-accent) 60%, transparent);
    }

    &.collapsible:hover,
    &.collapsible:focus-visible {
      border-color: color-mix(in srgb, var(--group-accent) 55%, var(--k-color-border));
      box-shadow: var(--deps-polished-shadow);
      transform: translateY(-3px);
    }
  }

  .deps-summary span {
    backdrop-filter: blur(8px);
    transition: transform 0.2s var(--deps-polished-ease-back), box-shadow 0.2s var(--deps-polished-ease);

    &:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgb(0 0 0 / 10%); }
  }

  .deps-search .el-input__wrapper {
    background: var(--deps-polished-glass);
    backdrop-filter: blur(12px) saturate(1.12);
    box-shadow: 0 4px 16px rgb(0 0 0 / 8%), inset 0 1px 0 rgb(255 255 255 / 8%) !important;
    transition: box-shadow 0.24s var(--deps-polished-ease);

    &.is-focus {
      box-shadow: 0 8px 24px rgb(0 0 0 / 12%), 0 0 0 3px color-mix(in srgb, var(--k-color-primary) 18%, transparent), inset 0 1px 0 rgb(255 255 255 / 10%) !important;
    }
  }

  .dep-package-card {
    border-color: color-mix(in srgb, var(--dep-accent) 20%, var(--k-color-border));
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--dep-accent) 7%, transparent), transparent 58%),
      var(--deps-polished-glass);
    box-shadow: 0 4px 14px rgb(0 0 0 / 8%), inset 0 1px 0 rgb(255 255 255 / 7%);
    backdrop-filter: blur(10px) saturate(1.08);
    transition:
      border-color 0.28s var(--deps-polished-ease),
      box-shadow 0.28s var(--deps-polished-ease),
      transform 0.28s var(--deps-polished-ease-back),
      background 0.28s var(--deps-polished-ease);

    &:hover {
      border-color: color-mix(in srgb, var(--dep-accent) 55%, var(--k-color-border));
      box-shadow:
        0 18px 40px color-mix(in srgb, var(--dep-accent) 14%, rgb(0 0 0 / 16%)),
        0 0 0 1px color-mix(in srgb, var(--dep-accent) 30%, transparent),
        inset 0 1px 0 rgb(255 255 255 / 10%);
      transform: translateY(-5px) scale(1.01);
    }

    &.expanded {
      box-shadow: 0 18px 40px color-mix(in srgb, var(--dep-accent) 14%, rgb(0 0 0 / 16%));
    }

    &:not(.installed)::after {
      background: linear-gradient(90deg, color-mix(in srgb, var(--dep-accent) 14%, transparent), transparent);
    }
  }

  .dep-status-mark,
  .dep-kind-pill,
  .dep-badge,
  .dep-meta-item {
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 5%);
  }

  .dep-status-mark {
    border-color: color-mix(in srgb, var(--dep-accent) 34%, var(--k-color-border));
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--dep-accent) 16%, transparent), transparent 64%),
      color-mix(in srgb, var(--k-side-bg) 76%, transparent);
  }

  .dep-kind-pill,
  .dep-meta-item {
    border-color: color-mix(in srgb, var(--dep-accent) 16%, var(--k-color-border));
    background: color-mix(in srgb, var(--k-side-bg) 74%, transparent);
  }

  .dep-badge {
    background: color-mix(in srgb, var(--dep-accent) 11%, var(--k-side-bg));
  }

  .dep-card-actions {
    border-top-color: color-mix(in srgb, var(--dep-accent) 18%, var(--k-color-border));
  }

  .dep-card-actions.floating {
    border-color: color-mix(in srgb, var(--dep-accent) 32%, var(--k-color-border));
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--dep-accent) 8%, transparent), transparent 70%),
      color-mix(in srgb, var(--k-card-bg) 90%, transparent);
    box-shadow: 0 16px 38px rgb(0 0 0 / 18%), inset 0 1px 0 rgb(255 255 255 / 7%);
    backdrop-filter: blur(14px) saturate(1.12);

    &::before {
      border-color: color-mix(in srgb, var(--dep-accent) 32%, var(--k-color-border));
      background: color-mix(in srgb, var(--k-card-bg) 90%, transparent);
    }
  }
}

.deps-apply-bar.market-mode-polished {
  border-top-color: color-mix(in srgb, var(--k-color-primary) 22%, var(--k-color-border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--k-color-primary) 8%, transparent), transparent 64%),
    color-mix(in srgb, var(--k-card-bg) 85%, transparent);
  box-shadow: 0 -20px 48px rgb(0 0 0 / 20%);
  backdrop-filter: blur(18px) saturate(1.18);
}

@keyframes deps-polished-enter {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.97);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
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

@media (prefers-reduced-motion: reduce) {
  .market-mode-polished.page-deps,
  .market-mode-polished .page-deps,
  .page-deps.market-mode-polished {
    .deps-group {
      animation: none;
    }

    .deps-prerelease-toggle,
    .deps-group-header,
    .dep-package-card {
      transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;

      &:hover,
      &:focus-visible {
        transform: none;
      }
    }
  }
}

</style>

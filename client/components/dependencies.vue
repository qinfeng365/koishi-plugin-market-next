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
          >
            <span class="deps-filter-option">
              <market-icon :name="option.icon"></market-icon>
              <span>{{ option.label }}</span>
              <span v-if="option.count" class="deps-filter-count">({{ option.count }})</span>
            </span>
          </el-option>
        </el-select>
        <button
          :class="['deps-filter', 'deps-prerelease-toggle', { active: prereleaseBlocked }]"
          @click="togglePrereleaseFilter"
        >
          <market-icon name="tag"></market-icon>
          <span>{{ t('dependencies.toolbar.blockPreview') }}</span>
        </button>
        <button
          class="deps-filter deps-layout-toggle"
          @click="toggleLayout"
          :title="depsLayout === 'grid' ? t('dependencies.toolbar.listView') : t('dependencies.toolbar.gridView')"
        >
          <svg v-if="depsLayout === 'grid'" viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="currentColor">
            <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="currentColor">
            <path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/>
          </svg>
          <span>{{ depsLayout === 'grid' ? t('dependencies.toolbar.listView') : t('dependencies.toolbar.gridView') }}</span>
        </button>
        <div class="deps-search">
          <el-input ref="searchInput" v-model="keyword" clearable :placeholder="t('dependencies.toolbar.searchPlaceholder')"></el-input>
        </div>
        <div class="deps-summary">
          <span v-if="summary.pending" class="primary">{{ t('dependencies.filters.pending') }} {{ summary.pending }}</span>
          <span v-if="summary.updatable" class="success">{{ t('dependencies.filters.updatable') }} {{ summary.updatable }}</span>
          <span v-if="summary.unconfigured" class="warning">{{ t('dependencies.filters.unconfigured') }} {{ summary.unconfigured }}</span>
          <span v-if="summary.errors" class="danger">{{ t('dependencies.filters.error') }} {{ summary.errors }}</span>
          <span v-if="summary.invalid" class="warning">{{ t('dependencies.filters.invalid') }} {{ summary.invalid }}</span>
          <span v-if="refreshing" class="loading">{{ t('dependencies.toolbar.loading') }}</span>
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
                <h2>
                  <market-icon :name="group.icon"></market-icon>
                  <span>{{ group.label }}</span>
                </h2>
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
                  <span class="col-name">{{ t('common.labels.name') }}</span>
                  <span class="col-version">{{ t('common.labels.installed') }}</span>
                  <span class="col-latest">{{ t('common.labels.latest') }}</span>
                  <span class="col-actions">{{ t('common.labels.operation') }}</span>
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
        <k-empty v-else>{{ t('dependencies.empty') }}</k-empty>
      </div>
    </el-scrollbar>
  </k-layout>

  <div v-if="summary.pending" :class="['deps-apply-bar', modeClass]">
    <div>
      <strong>{{ t('dependencies.apply.count', { count: summary.pending }) }}</strong>
      <span>{{ t('dependencies.apply.description') }}</span>
    </div>
    <div class="deps-apply-actions">
      <el-button @click="clearChanges">{{ t('dependencies.apply.discard') }}</el-button>
      <el-button type="primary" @click="showConfirm = true">{{ t('dependencies.apply.apply') }}</el-button>
    </div>
  </div>

  <manual-install/>
</template>

<script lang="ts" setup>

import { computed, onBeforeUnmount, onMounted, ref, watch, WatchStopHandle } from 'vue'
import { message, router, store, useConfig, useContext } from '@koishijs/client'
import { useMarketNextI18n } from '../i18n'
import { getBundleRecords, getCollapsedGroups, getFrontendMode, getDepsLayout, getLatestVersion, getMarketNextConfig, getMarketNextPolicy, getPendingOverrides, getWritableMarketNextPolicy, hasUpdate, isUpdateCheckDisabled, isUpdateIgnored, patchMarketNextConfig, patchMarketNextData } from '../utils'
import { addManual, createLocalBundleRecord, getConfigWriter, getRegistryStatus, showConfirm, showEnvironmentVersions, type ClientConfigWriter } from './utils'
import ManualInstall from './manual.vue'
import PackageView from './package.vue'
import { isBundlePackageName } from '../../src/shared/bundle'
import { loadMarketObjects } from '../market/state'

type FilterKey = 'all' | 'pending' | 'bundle' | 'unconfigured' | 'updatable' | 'ignored' | 'check-disabled' | 'invalid' | 'error' | 'workspace' | 'manual'
type ItemKind = 'pending' | 'bundle' | 'unconfigured' | 'updatable' | 'ignored' | 'check-disabled' | 'invalid' | 'error' | 'workspace' | 'manual' | 'installed'

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
  icon: string
  items: DependencyItem[]
  collapsed: boolean
  collapsible: boolean
}

const config = useConfig()
const ctx = useContext()
const { t } = useMarketNextI18n()
const keyword = ref('')
const filter = ref<FilterKey>('all')
const searchInput = ref<{ focus?: () => void }>()
const frontendMode = computed(() => getFrontendMode(config.value))
const depsLayout = computed(() => getDepsLayout(config.value))
const modeClass = computed(() => `market-mode-${frontendMode.value}`)
const layoutClass = computed(() => `deps-layout-${depsLayout.value}`)

function getOverride() {
  return getPendingOverrides()
}

function getUpdatePolicy() {
  return getMarketNextPolicy(config.value)
}

function isManageableBundle(name: string) {
  return !!(getBundleRecords(config.value)[name] || createLocalBundleRecord(name))
}

const names = computed(() => {
  const configWriter = getConfigWriter(ctx)
  const explicit: Record<string, unknown> = {
    ...(store.dependencies ?? {}),
    ...getOverride(),
  }
  for (const name of Object.keys(store.packages ?? {})) {
    if (isUnconfigured(name, configWriter) || isManageableBundle(name)) explicit[name] = true
  }
  return Object
    .keys(explicit)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
})

watch(names, (value) => {
  void loadMarketObjects(value).catch(error => {
    console.error('[market-next] failed to load dependency market metadata', error)
  })
}, { immediate: true })

let dispose: WatchStopHandle
watch(() => store.market?.registry, (registry) => {
  dispose?.()
  if (!registry) return
  dispose = watch(() => getPendingOverrides(), (object) => {
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

function classify(name: string, configWriter?: ClientConfigWriter): ItemKind {
  const dep = store.dependencies?.[name]
  const override = getOverride()
  const pending = Object.prototype.hasOwnProperty.call(override, name)
  if (pending) return 'pending'
  if (!dep) return isManageableBundle(name) && store.packages?.[name] ? 'bundle' : isUnconfigured(name, configWriter) ? 'unconfigured' : 'manual'
  if (dep.workspace) return 'workspace'
  if (dep.invalid) return 'invalid'
  if (isManageableBundle(name)) return 'bundle'
  if (isUnconfigured(name, configWriter)) return 'unconfigured'
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

function isUnconfigured(name: string, configWriter = getConfigWriter(ctx)) {
  if (isManageableBundle(name)) return false
  return !!configWriter && !!store.packages?.[name] && isPluginPackage(name) && !configWriter.get(name)?.length
}

const items = computed<DependencyItem[]>(() => {
  const configWriter = getConfigWriter(ctx)
  return names.value.map(name => ({
    name,
    kind: classify(name, configWriter),
    pending: Object.prototype.hasOwnProperty.call(getOverride(), name),
    manual: !store.dependencies?.[name] && !store.packages?.[name],
  }))
})

const updates = computed(() => items.value.filter(item => item.kind === 'updatable').map(item => item.name))

const prereleaseBlocked = computed(() => !!getUpdatePolicy().updateIgnorePrerelease)

const summary = computed(() => {
  return {
    total: items.value.length,
    updatable: items.value.filter(item => item.kind === 'updatable').length,
    bundle: items.value.filter(item => item.kind === 'bundle').length,
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
  { value: 'all' as const, label: t('dependencies.filters.all'), icon: 'solid:all', count: summary.value.total },
  { value: 'pending' as const, label: t('dependencies.filters.pending'), icon: 'tag', count: summary.value.pending },
  { value: 'bundle' as const, label: t('dependencies.filters.bundle'), icon: 'file-archive', count: summary.value.bundle },
  { value: 'unconfigured' as const, label: t('dependencies.filters.unconfigured'), icon: 'preview', count: summary.value.unconfigured },
  { value: 'updatable' as const, label: t('dependencies.filters.updatable'), icon: 'asc', count: summary.value.updatable },
  { value: 'ignored' as const, label: t('dependencies.filters.ignored'), icon: 'installed', count: summary.value.ignored },
  { value: 'check-disabled' as const, label: t('dependencies.filters.checkDisabled'), icon: 'installed', count: summary.value.checkDisabled },
  { value: 'invalid' as const, label: t('dependencies.filters.invalid'), icon: 'insecure', count: summary.value.invalid },
  { value: 'error' as const, label: t('dependencies.filters.error'), icon: 'insecure', count: summary.value.errors },
  { value: 'workspace' as const, label: t('dependencies.filters.workspace'), icon: 'file-archive', count: summary.value.workspace },
  { value: 'manual' as const, label: t('dependencies.filters.manual'), icon: 'search', count: summary.value.manual },
])

const groupMeta = computed<Record<ItemKind, Omit<DependencyGroup, 'items' | 'collapsed' | 'collapsible'>>>(() => ({
  pending: { key: 'pending', label: t('dependencies.groups.pending.label'), icon: 'tag', description: t('dependencies.groups.pending.description') },
  bundle: { key: 'bundle', label: t('dependencies.groups.bundle.label'), icon: 'file-archive', description: t('dependencies.groups.bundle.description') },
  updatable: { key: 'updatable', label: t('dependencies.groups.updatable.label'), icon: 'asc', description: t('dependencies.groups.updatable.description') },
  ignored: { key: 'ignored', label: t('dependencies.groups.ignored.label'), icon: 'installed', description: t('dependencies.groups.ignored.description') },
  'check-disabled': { key: 'check-disabled', label: t('dependencies.groups.checkDisabled.label'), icon: 'installed', description: t('dependencies.groups.checkDisabled.description') },
  unconfigured: { key: 'unconfigured', label: t('dependencies.groups.unconfigured.label'), icon: 'preview', description: t('dependencies.groups.unconfigured.description') },
  invalid: { key: 'invalid', label: t('dependencies.groups.invalid.label'), icon: 'insecure', description: t('dependencies.groups.invalid.description') },
  error: { key: 'error', label: t('dependencies.groups.error.label'), icon: 'insecure', description: t('dependencies.groups.error.description') },
  workspace: { key: 'workspace', label: t('dependencies.groups.workspace.label'), icon: 'file-archive', description: t('dependencies.groups.workspace.description') },
  manual: { key: 'manual', label: t('dependencies.groups.manual.label'), icon: 'search', description: t('dependencies.groups.manual.description') },
  installed: { key: 'installed', label: t('dependencies.groups.installed.label'), icon: 'installed', description: t('dependencies.groups.installed.description') },
}))

const groupOrder: ItemKind[] = ['pending', 'bundle', 'unconfigured', 'updatable', 'ignored', 'check-disabled', 'invalid', 'error', 'workspace', 'manual', 'installed']

const collapseEnabled = computed(() => filter.value === 'all' && !keyword.value.trim())

function getDefaultCollapsed(key: ItemKind) {
  return key === 'unconfigured' || key === 'ignored'
}

function isGroupCollapsed(key: ItemKind) {
  if (!collapseEnabled.value) return false
  return getCollapsedGroups()[key] ?? getDefaultCollapsed(key)
}

function toggleGroup(key: ItemKind) {
  const groups = {
    ...getCollapsedGroups(),
    [key]: !isGroupCollapsed(key),
  }
  void patchMarketNextData({ collapsedGroups: groups })
}

function toggleLayout() {
  if (!config.value.market) config.value.market = {}
  const next = depsLayout.value === 'grid' ? 'list' : 'grid'
  config.value.market.depsLayout = next
  const pluginConfig = getMarketNextConfig()
  if (pluginConfig) pluginConfig.depsLayout = next
  patchMarketNextConfig({ depsLayout: next })
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
       ...groupMeta.value[key],
      items: buckets[key],
      collapsed: isGroupCollapsed(key),
      collapsible: collapseEnabled.value,
    }))
    .filter(group => group.items.length)
})

function clearChanges() {
  const override = getPendingOverrides()
  for (const key of Object.keys(override)) delete override[key]
  void patchMarketNextData({ override: { ...override } })
}

async function togglePrereleaseFilter() {
  const policy = getWritableMarketNextPolicy(config.value)
  const previous = !!policy.updateIgnorePrerelease
  policy.updateIgnorePrerelease = !previous
  const saved = await patchMarketNextConfig({ updateIgnorePrerelease: policy.updateIgnorePrerelease })
  if (!saved) {
    policy.updateIgnorePrerelease = previous
    message.error(t('common.messages.saveFailed'))
  }
}

ctx.action('dependencies.upgrade', {
  disabled: () => !updates.value.length,
  async action() {
    for (const name of updates.value) {
      const version = getLatestVersion(name, getUpdatePolicy())
      if (!version) continue
      getPendingOverrides()[name] = version
    }
    void patchMarketNextData({ override: { ...getPendingOverrides() } })
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

.deps-layout-toggle {
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

  svg { width: 1rem; height: 1rem; flex: 0 0 auto; }

  &:hover {
    color: var(--fg1);
    background: color-mix(in srgb, var(--k-side-bg) 95%, transparent);
    border-color: color-mix(in srgb, var(--k-color-border) 80%, transparent);
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

.deps-filter-option {
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
  min-width: 0;

  .market-icon {
    width: 0.9rem;
    height: 0.9rem;
    flex: 0 0 auto;
    color: color-mix(in srgb, var(--k-color-primary) 76%, currentColor);
  }

  span:not(.deps-filter-count) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.deps-filter-count {
  color: var(--fg3);
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
  &.bundle { --group-accent: #9b74df; }
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
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    margin: 0;
    font-size: 0.96rem;
    line-height: 1.4;
    font-weight: 600;

    .market-icon {
      width: 0.95rem;
      height: 0.95rem;
      flex: 0 0 auto;
      color: var(--group-accent);
      filter: drop-shadow(0 0 6px color-mix(in srgb, var(--group-accent) 24%, transparent));
    }
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
  --deps-polished-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --deps-polished-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --deps-polished-glass: color-mix(in srgb, var(--k-card-bg) 45%, transparent);
  --deps-polished-glass-strong: color-mix(in srgb, var(--k-card-bg) 60%, transparent);
  --deps-polished-shadow: 0 6px 16px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  --deps-polished-line: color-mix(in srgb, var(--k-color-primary) 12%, var(--k-color-border));

  // scrollbar
  .el-scrollbar__bar.is-vertical .el-scrollbar__thumb {
    background: color-mix(in srgb, var(--k-color-primary) 28%, var(--el-scrollbar-bg-color, rgba(144, 147, 153, 0.3)));
    transition: background 0.2s var(--deps-polished-ease);
    &:hover { background: color-mix(in srgb, var(--k-color-primary) 55%, var(--el-scrollbar-hover-bg-color, rgba(144, 147, 153, 0.5))); }
  }

  // layout container transparent override
  .layout-main {
    position: relative;
    z-index: 1;
    background-color: var(--k-page-bg, var(--k-bg-darker)) !important;
    background-image: radial-gradient(color-mix(in srgb, var(--fg1) 8%, transparent) 1.2px, transparent 1.2px) !important;
    background-size: 24px 24px !important;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      inset: -10%;
      background:
        radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--k-color-primary) 22%, transparent) 0%, transparent 50%),
        radial-gradient(circle at 80% 80%, color-mix(in srgb, var(--k-color-success) 18%, transparent) 0%, transparent 50%),
        radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--k-color-warning) 12%, transparent) 0%, transparent 45%);
      pointer-events: none;
      z-index: 0;
      opacity: 0.75;
      animation: polished-bg-drift 32s infinite alternate ease-in-out;
      will-change: transform;
    }
  }

  .body-container {
    position: relative;
    z-index: 2;
  }

  .deps-toolbar {
    border-bottom-color: var(--deps-polished-line);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent),
      var(--deps-polished-glass);
    box-shadow: 0 2px 10px rgb(0 0 0 / 4%), inset 0 1px 0 rgb(255 255 255 / 5%);
    backdrop-filter: blur(12px) saturate(120%);
  }

  .deps-filter-select .el-select__wrapper,
  .deps-search .el-input__wrapper {
    border: 1px solid color-mix(in srgb, var(--k-color-border) 64%, transparent);
    background: var(--deps-polished-glass);
    backdrop-filter: blur(8px) saturate(110%);
    box-shadow: 0 2px 8px rgb(0 0 0 / 4%), inset 0 1px 0 rgb(255 255 255 / 5%) !important;
    transition:
      border-color 0.25s var(--deps-polished-ease),
      box-shadow 0.25s var(--deps-polished-ease),
      background 0.25s var(--deps-polished-ease);

    &.is-focused,
    &.is-focus {
      border-color: color-mix(in srgb, var(--k-color-primary) 40%, var(--k-color-border));
      background: var(--deps-polished-glass-strong);
      box-shadow: 0 4px 12px rgb(0 0 0 / 6%), 0 0 0 2px color-mix(in srgb, var(--k-color-primary) 10%, transparent), inset 0 1px 0 rgb(255 255 255 / 7%) !important;
    }
  }

  .deps-prerelease-toggle,
  .deps-layout-toggle,
  .deps-summary span {
    border-color: color-mix(in srgb, var(--k-color-border) 64%, transparent);
    background:
      linear-gradient(180deg, rgb(255 255 255 / 3%), transparent),
      color-mix(in srgb, var(--k-side-bg) 76%, transparent);
    box-shadow: 0 1px 6px rgb(0 0 0 / 4%), inset 0 1px 0 rgb(255 255 255 / 5%);
    transition: color 0.18s var(--deps-polished-ease), background 0.18s var(--deps-polished-ease), border-color 0.18s var(--deps-polished-ease), box-shadow 0.18s var(--deps-polished-ease), transform 0.25s var(--deps-polished-ease-spring);
  }

  .deps-prerelease-toggle:hover,
  .deps-layout-toggle:hover {
    border-color: color-mix(in srgb, var(--k-color-primary) 40%, var(--k-color-border));
    background: var(--deps-polished-glass-strong);
    box-shadow: 0 4px 10px rgb(0 0 0 / 6%);
    transform: translateY(-2px);
  }

  .deps-prerelease-toggle.active {
    box-shadow: 0 4px 12px color-mix(in srgb, var(--k-color-primary) 12%, transparent), inset 0 1px 0 rgb(255 255 255 / 8%);
  }

  .deps-group {
    animation: deps-polished-enter 0.45s var(--deps-polished-ease) both;
  }

  .deps-group-header {
    border-color: color-mix(in srgb, var(--group-accent, var(--k-color-border)) 24%, var(--k-color-border));
    background:
      linear-gradient(180deg, rgb(255 255 255 / 3%), transparent 60%),
      var(--deps-polished-glass);
    box-shadow: 0 2px 8px rgb(0 0 0 / 4%), inset 0 1px 0 rgb(255 255 255 / 5%);
    backdrop-filter: blur(10px) saturate(110%);
    transition:
      border-color 0.25s var(--deps-polished-ease),
      background 0.25s var(--deps-polished-ease),
      box-shadow 0.25s var(--deps-polished-ease),
      transform 0.3s var(--deps-polished-ease-spring);

    h2 {
      color: var(--group-accent, var(--fg1));
    }

    p { opacity: 0.75; }

    &::before {
      width: 3px;
      border-radius: 0 1.5px 1.5px 0;
      background: var(--group-accent, var(--k-color-primary));
      box-shadow: none;
    }

    &.collapsible:hover,
    &.collapsible:focus-visible {
      border-color: color-mix(in srgb, var(--group-accent, var(--k-color-primary)) 40%, var(--k-color-border));
      background: var(--deps-polished-glass-strong);
      box-shadow: var(--deps-polished-shadow);
      transform: translateY(-2px);
    }
  }

  .deps-summary span {
    backdrop-filter: blur(4px);
    transition: transform 0.25s var(--deps-polished-ease-spring), box-shadow 0.2s var(--deps-polished-ease);

    &:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgb(0 0 0 / 10%); }
  }

  .dep-package-card {
    border-color: color-mix(in srgb, var(--k-color-border) 70%, transparent);
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%),
      var(--deps-polished-glass) !important;
    background-color: transparent !important;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.04),
      0 1px 2px rgba(0, 0, 0, 0.03),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(16px) saturate(140%);
    transition:
      border-color 0.3s var(--deps-polished-ease),
      box-shadow 0.4s var(--deps-polished-ease),
      transform 0.4s var(--deps-polished-ease-spring),
      background 0.3s var(--deps-polished-ease);
    will-change: transform, box-shadow;

    &::before {
      content: '';
      position: absolute;
      inset: -12px;
      border-radius: 20px;
      background: radial-gradient(circle at center, color-mix(in srgb, var(--dep-accent) 18%, transparent), transparent 70%);
      z-index: -1;
      opacity: 0;
      filter: blur(20px);
      transition: opacity 0.4s var(--deps-polished-ease);
      pointer-events: none;
    }

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      border: 1px solid transparent;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 40%) border-box;
      -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: destination-out;
      mask-composite: exclude;
      pointer-events: none;
      transition: opacity 0.3s var(--deps-polished-ease);
    }

    &:hover {
      border-color: color-mix(in srgb, var(--dep-accent) 45%, var(--k-color-border));
      background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%),
        var(--deps-polished-glass-strong);
      box-shadow:
        0 16px 36px rgba(0, 0, 0, 0.12),
        0 4px 10px rgba(0, 0, 0, 0.06),
        inset 0 1px 0 rgba(255, 255, 255, 0.12);
      transform: translateY(-4px) scale(1.012);

      &::before {
        opacity: 1;
      }
    }

    &.expanded {
      border-color: color-mix(in srgb, var(--dep-accent) 50%, var(--k-color-border));
      box-shadow:
        0 20px 48px rgba(0, 0, 0, 0.16),
        0 6px 14px rgba(0, 0, 0, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.15);
      transform: translateY(-2px) scale(1.006);
    }

    &:not(.installed)::after {
      background: none;
      display: none;
    }
  }

  .dep-status-mark,
  .dep-kind-pill,
  .dep-badge,
  .dep-meta-item {
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 5%);
  }

  .dep-status-mark {
    border-color: color-mix(in srgb, var(--dep-accent) 24%, var(--k-color-border));
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--dep-accent) 12%, transparent), transparent 64%),
      color-mix(in srgb, var(--k-side-bg) 76%, transparent);
    box-shadow: 0 1px 6px color-mix(in srgb, var(--dep-accent) 10%, transparent), inset 0 1px 0 rgb(255 255 255 / 6%);
    transition: border-color 0.22s var(--deps-polished-ease), box-shadow 0.22s var(--deps-polished-ease), transform 0.25s var(--deps-polished-ease-spring);
  }

  .dep-kind-pill,
  .dep-meta-item {
    border-color: color-mix(in srgb, var(--dep-accent) 14%, var(--k-color-border));
    background: color-mix(in srgb, var(--k-side-bg) 74%, transparent);
  }

  .dep-badge {
    background: color-mix(in srgb, var(--dep-accent) 10%, var(--k-side-bg));
  }

  .dep-card-actions {
    border-top-color: color-mix(in srgb, var(--dep-accent) 18%, var(--k-color-border));
  }

  .dep-card-actions.floating {
    border-color: color-mix(in srgb, var(--dep-accent) 28%, var(--k-color-border));
    background:
      linear-gradient(180deg, rgb(255 255 255 / 3%), transparent 60%),
      var(--deps-polished-glass-strong);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(12px) saturate(120%);

    &::before {
      border-color: color-mix(in srgb, var(--dep-accent) 28%, var(--k-color-border));
      background: var(--deps-polished-glass-strong);
    }
  }

  .deps-layout-list .deps-grid {
    border-color: color-mix(in srgb, var(--k-color-primary) 14%, var(--k-color-border));
    background: color-mix(in srgb, var(--k-card-bg) 82%, transparent);
    box-shadow: 0 4px 12px rgb(0 0 0 / 5%), inset 0 1px 0 rgb(255 255 255 / 5%);
  }

  .deps-list-header {
    background:
      linear-gradient(180deg, rgb(255 255 255 / 3%), transparent),
      color-mix(in srgb, var(--k-side-bg) 74%, transparent);
    border-bottom-color: color-mix(in srgb, var(--k-color-primary) 12%, var(--k-color-border));
  }

  .dep-list-row {
    position: relative;
    background: var(--deps-polished-glass);
    transition:
      background 0.3s var(--deps-polished-ease),
      box-shadow 0.3s var(--deps-polished-ease),
      transform 0.35s var(--deps-polished-ease-spring);

    &::before {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: 3px;
      background: var(--dep-accent);
      opacity: 0.35;
      transition: opacity 0.3s var(--deps-polished-ease);
    }

    &:hover {
      background: var(--deps-polished-glass-strong);
      box-shadow:
        0 4px 12px rgba(0, 0, 0, 0.06),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      transform: translateX(4px);
      
      &::before {
        opacity: 1;
      }
    }

    .dep-status-mark {
      box-shadow: 0 1px 4px color-mix(in srgb, var(--dep-accent) 12%, transparent), inset 0 1px 0 rgb(255 255 255 / 6%);
    }
  }
}

.deps-apply-bar.market-mode-polished {
  border-top-color: color-mix(in srgb, var(--k-color-primary) 18%, var(--k-color-border));
  background:
    linear-gradient(180deg, rgb(255 255 255 / 3%), transparent),
    color-mix(in srgb, var(--k-card-bg) 92%, transparent);
  box-shadow: 0 -8px 24px rgb(0 0 0 / 8%), inset 0 1px 0 rgb(255 255 255 / 5%);
  backdrop-filter: blur(8px) saturate(1.04);
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

@keyframes polished-bg-drift {
  0% {
    transform: translate(0, 0) scale(1) rotate(0deg);
  }
  50% {
    transform: translate(4%, 5%) scale(1.02) rotate(2deg);
  }
  100% {
    transform: translate(-3%, -4%) scale(0.98) rotate(-2deg);
  }
}

@media (max-width: 768px) {
  .deps-toolbar {
    grid-template-columns: 1fr;
  }

  .deps-toolbar-row {
    flex-wrap: wrap;
    align-items: stretch;
  }

  .deps-filter-select {
    flex: 1 1 9rem;
    width: auto;
    min-width: 0;
  }

  .deps-prerelease-toggle,
  .deps-layout-toggle {
    flex: 1 1 auto;
    justify-content: center;
    min-width: 0;
  }

  .deps-search {
    flex: 1 1 100%;
    order: 4;
  }

  .deps-summary {
    flex: 1 1 100%;
    order: 5;
  }

  .deps-grid {
    grid-template-columns: 1fr;
  }

  .deps-layout-list .deps-grid {
    border: 0;
    border-radius: 0;
    overflow: visible;
    gap: 0.45rem;
  }

  .deps-list-header {
    display: none;
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

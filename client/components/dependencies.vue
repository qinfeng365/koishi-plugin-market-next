<template>
  <k-layout main="page-deps" :class="[modeClass, layoutClass]" menu="dependencies">
    <div class="deps-toolbar">
      <div class="deps-toolbar-row">
        <el-select v-model="filter" size="small" class="deps-filter-select" :title="filterLabel">
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
          :title="t('dependencies.toolbar.blockPreview')"
          :aria-label="t('dependencies.toolbar.blockPreview')"
          :aria-pressed="String(prereleaseBlocked)"
          @click="togglePrereleaseFilter"
        >
          <market-icon name="tag"></market-icon>
          <span>{{ t('dependencies.toolbar.blockPreview') }}</span>
        </button>
        <button
          class="deps-filter deps-layout-toggle"
          :aria-pressed="String(depsLayout === 'list')"
          :aria-label="depsLayout === 'grid' ? t('dependencies.toolbar.listView') : t('dependencies.toolbar.gridView')"
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
          <el-input
            ref="searchInput"
            v-model="keyword"
            clearable
            :placeholder="t('dependencies.toolbar.searchPlaceholder')"
            @keydown.esc="keyword = ''"
          ></el-input>
        </div>
      </div>
      <div
        v-if="metadataLoading"
        class="deps-loading"
        role="progressbar"
        :aria-label="t('dependencies.toolbar.loading')"
      ></div>
    </div>

    <el-scrollbar class="body-container" :aria-busy="String(metadataLoading)">
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
              <div class="deps-group-heading">
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
        <k-empty v-else>
          <p>{{ t('dependencies.empty') }}</p>
          <el-button v-if="hasActiveFilters" size="small" @click="resetFilters">
            {{ t('dependencies.toolbar.clearFilters') }}
          </el-button>
        </k-empty>
      </div>
    </el-scrollbar>
  </k-layout>

  <div v-if="summary.pending" :class="['deps-apply-bar', modeClass]">
    <div role="status">
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
import { shouldIncludeDiscoveredLocalPlugin } from '../../src/shared/dependency-source'
import { loadMarketObjects } from '../market/state'

type FilterKey = 'all' | 'pending' | 'bundle' | 'unconfigured' | 'updatable' | 'ignored' | 'check-disabled' | 'invalid' | 'error' | 'local' | 'manual'
type ItemKind = 'pending' | 'bundle' | 'unconfigured' | 'updatable' | 'ignored' | 'check-disabled' | 'invalid' | 'error' | 'local' | 'manual' | 'installed'

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
const metadataLoading = ref(false)
let metadataLoadToken = 0
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
    const pkg = store.packages?.[name]
    if (isUnconfigured(name, configWriter)
      || isManageableBundle(name)
      || isPluginPackage(name) && shouldIncludeDiscoveredLocalPlugin({
        declared: !!store.dependencies?.[name],
        configured: !!configWriter?.get(name)?.length,
        running: !!pkg?.runtime?.id,
        workspace: !!pkg?.workspace,
      })) {
      explicit[name] = true
    }
  }
  return Object
    .keys(explicit)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
})

watch(names, async (value) => {
  const token = ++metadataLoadToken
  metadataLoading.value = true
  try {
    await loadMarketObjects(value)
  } catch (error) {
    console.error('[market-next] failed to load dependency market metadata', error)
  } finally {
    if (token === metadataLoadToken) metadataLoading.value = false
  }
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
  if (!dep) return store.packages?.[name] ? 'local' : 'manual'
  if (dep.local || dep.workspace) return 'local'
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
    local: items.value.filter(item => item.kind === 'local').length,
    manual: items.value.filter(item => item.manual).length,
  }
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
  { value: 'local' as const, label: t('dependencies.filters.local'), icon: 'file-archive', count: summary.value.local },
  { value: 'manual' as const, label: t('dependencies.filters.manual'), icon: 'search', count: summary.value.manual },
])

const filterLabel = computed(() => {
  const option = filterOptions.value.find(option => option.value === filter.value)
  return option ? `${option.label}${option.count ? ` (${option.count})` : ''}` : ''
})

const hasActiveFilters = computed(() => filter.value !== 'all' || !!keyword.value.trim())

function resetFilters() {
  filter.value = 'all'
  keyword.value = ''
}

const groupMeta = computed<Record<ItemKind, Omit<DependencyGroup, 'items' | 'collapsed' | 'collapsible'>>>(() => ({
  pending: { key: 'pending', label: t('dependencies.groups.pending.label'), icon: 'tag', description: t('dependencies.groups.pending.description') },
  bundle: { key: 'bundle', label: t('dependencies.groups.bundle.label'), icon: 'file-archive', description: t('dependencies.groups.bundle.description') },
  updatable: { key: 'updatable', label: t('dependencies.groups.updatable.label'), icon: 'asc', description: t('dependencies.groups.updatable.description') },
  ignored: { key: 'ignored', label: t('dependencies.groups.ignored.label'), icon: 'installed', description: t('dependencies.groups.ignored.description') },
  'check-disabled': { key: 'check-disabled', label: t('dependencies.groups.checkDisabled.label'), icon: 'installed', description: t('dependencies.groups.checkDisabled.description') },
  unconfigured: { key: 'unconfigured', label: t('dependencies.groups.unconfigured.label'), icon: 'preview', description: t('dependencies.groups.unconfigured.description') },
  invalid: { key: 'invalid', label: t('dependencies.groups.invalid.label'), icon: 'insecure', description: t('dependencies.groups.invalid.description') },
  error: { key: 'error', label: t('dependencies.groups.error.label'), icon: 'insecure', description: t('dependencies.groups.error.description') },
  local: { key: 'local', label: t('dependencies.groups.local.label'), icon: 'file-archive', description: t('dependencies.groups.local.description') },
  manual: { key: 'manual', label: t('dependencies.groups.manual.label'), icon: 'search', description: t('dependencies.groups.manual.description') },
  installed: { key: 'installed', label: t('dependencies.groups.installed.label'), icon: 'installed', description: t('dependencies.groups.installed.description') },
}))

const groupOrder: ItemKind[] = ['pending', 'bundle', 'unconfigured', 'updatable', 'ignored', 'check-disabled', 'invalid', 'error', 'local', 'manual', 'installed']

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
// 依赖管理页：中性表面、发丝边界，状态色只用于图标、徽标与数值。

@mixin deps-tokens {
  --deps-canvas: color-mix(in srgb, var(--k-main-bg) 94%, var(--fg1) 6%);
  --deps-surface: var(--k-card-bg);
  --deps-line: color-mix(in srgb, var(--fg1) 10%, transparent);
  --deps-line-soft: color-mix(in srgb, var(--fg1) 6%, transparent);
  --deps-line-strong: color-mix(in srgb, var(--fg1) 20%, transparent);
  --deps-hover: color-mix(in srgb, var(--fg1) 4%, transparent);
  --deps-active: color-mix(in srgb, var(--fg1) 7%, transparent);
  --deps-text: var(--fg1);
  --deps-text-2: color-mix(in srgb, var(--fg1) 76%, var(--k-main-bg));
  --deps-text-3: color-mix(in srgb, var(--fg1) 68%, var(--k-main-bg));
  --deps-radius: 10px;
  --deps-ease: cubic-bezier(0.2, 0.7, 0.3, 1);
  --deps-accent: var(--fg1);
  --deps-accent-text: color-mix(in srgb, var(--deps-accent) 52%, var(--fg1));
  --deps-accent-soft: color-mix(in srgb, var(--deps-accent) 11%, transparent);
}

.page-deps {
  @include deps-tokens;

  display: flex;
  flex-flow: column;
  min-height: 0;
  background: var(--deps-canvas);
  color: var(--deps-text);

  .body-container {
    flex: 1 1 auto;
    min-height: 0;
  }

  .k-empty {
    flex: 1 1 auto;
    height: auto;
    min-height: 22rem;
    margin-top: 0;
    gap: 0.75rem;
    color: var(--deps-text-2);

    p {
      margin: 0;
    }

    .image {
      width: 7rem;
      color: color-mix(in srgb, var(--fg1) 6%, transparent);
    }

    .el-button {
      margin-top: 0.25rem;
    }
  }
}

.deps-apply-bar {
  @include deps-tokens;
}

// 暗色下使用控制台主背景，避免画布比卡片更亮。
html.dark .page-deps,
html.dark .deps-apply-bar,
.theme-root.dark .page-deps,
.theme-root.dark .deps-apply-bar {
  --deps-canvas: var(--k-main-bg);
}

// ---------------------------------------------------------------------------
// 工具栏

.deps-toolbar {
  position: relative;
  flex: 0 0 auto;
  padding: 0.6rem var(--card-margin);
  background: var(--deps-canvas);
  border-bottom: 1px solid var(--deps-line);
}

.deps-loading {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  overflow: hidden;
  pointer-events: none;

  &::after {
    content: '';
    display: block;
    width: 35%;
    height: 100%;
    border-radius: 999px;
    background: color-mix(in srgb, var(--k-color-primary) 55%, transparent);
    animation: deps-loading 1.1s var(--deps-ease) infinite;
  }
}

.deps-toolbar-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.deps-filter-select {
  flex: 0 1 auto;
  width: auto;
  min-width: 8.5rem;
  max-width: 13rem;
}

.deps-search {
  flex: 1 1 auto;
  min-width: 0;
}

.deps-search .el-input__wrapper,
.deps-filter-select .el-select__wrapper {
  border-radius: 8px;
  background: var(--deps-surface);
  box-shadow: 0 0 0 1px var(--deps-line-strong) inset !important;
  transition: box-shadow 120ms var(--deps-ease), background 120ms var(--deps-ease);

  &:hover {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--fg1) 30%, transparent) inset !important;
  }

  &.is-focused,
  &.is-focus {
    background: var(--deps-surface);
    box-shadow:
      0 0 0 1px var(--k-color-primary) inset,
      0 0 0 3px color-mix(in srgb, var(--k-color-primary) 14%, transparent) !important;
  }
}

.deps-filter {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  height: 2rem;
  padding: 0 0.6rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--deps-text-2);
  font-size: 0.8rem;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: color 120ms var(--deps-ease), background 120ms var(--deps-ease), border-color 120ms var(--deps-ease);

  .market-icon,
  svg {
    width: 0.9rem;
    height: 0.9rem;
    flex: 0 0 auto;
  }

  &:hover {
    color: var(--deps-text);
    background: var(--deps-hover);
  }

  &:active {
    background: var(--deps-active);
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--k-color-primary) 45%, transparent);
    outline-offset: 1px;
  }

  &.active {
    color: color-mix(in srgb, var(--k-color-primary) 72%, var(--deps-text));
    border-color: color-mix(in srgb, var(--k-color-primary) 26%, transparent);
    background: color-mix(in srgb, var(--k-color-primary) 9%, transparent);
  }
}

.deps-layout-toggle svg {
  width: 1rem;
  height: 1rem;
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
    color: color-mix(in srgb, var(--k-color-primary) 55%, var(--fg2));
  }

  span:not(.deps-filter-count) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.deps-filter-count {
  color: var(--deps-text-3);
  font-variant-numeric: tabular-nums;
}

// ---------------------------------------------------------------------------
// 内容与分组

.deps-content {
  padding: 1rem var(--card-margin) var(--card-margin);

  &.pending {
    padding-bottom: 6rem;
  }
}

.deps-group {
  --deps-accent: var(--fg1);

  &.pending,
  &.manual {
    --deps-accent: var(--k-color-primary);
  }

  &.bundle {
    --deps-accent: #9b74df;
  }

  &.updatable {
    --deps-accent: var(--k-color-success);
  }

  &.unconfigured,
  &.local,
  &.workspace,
  &.invalid {
    --deps-accent: var(--warning);
  }

  &.error {
    --deps-accent: var(--danger);
  }
}

.deps-group + .deps-group {
  margin-top: 1.15rem;
}

.deps-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2.2rem;
  margin: 0 0 0.5rem;
  padding: 0.2rem 0.45rem;
  border-radius: 8px;
  background: transparent;
  transition: background 120ms var(--deps-ease);

  &.collapsible {
    cursor: pointer;
    user-select: none;
  }

  &.collapsible:hover {
    background: var(--deps-hover);
  }

  &.collapsible:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--k-color-primary) 45%, transparent);
    outline-offset: 1px;
    background: var(--deps-hover);
  }

  .deps-group-heading {
    flex: 1 1 auto;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    min-width: 0;
  }

  h2 {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    margin: 0;
    flex: 0 0 auto;
    color: var(--deps-text);
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1.4;

    .market-icon {
      width: 0.95rem;
      height: 0.95rem;
      flex: 0 0 auto;
      color: var(--deps-accent-text);
    }
  }

  p {
    flex: 1 1 auto;
    margin: 0;
    min-width: 0;
    color: var(--deps-text-3);
    font-size: 0.76rem;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .deps-group-side {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .deps-group-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.45rem;
    height: 1.4rem;
    padding: 0 0.4rem;
    border-radius: 999px;
    background: var(--deps-hover);
    color: var(--deps-text-2);
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .deps-group-chevron {
    width: 0.95rem;
    height: 0.95rem;
    color: var(--deps-text-3);
    transform: rotate(0deg);
    transition: transform 160ms var(--deps-ease);

    &.collapsed {
      transform: rotate(180deg);
    }
  }
}

.deps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  align-items: start;
  gap: 0.6rem;
}

// ---------------------------------------------------------------------------
// 列表模式

.deps-layout-list .deps-grid {
  --deps-list-columns: 1.8rem minmax(0, 1fr) 7rem 8rem 24rem;

  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--deps-line);
  border-radius: var(--deps-radius);
  background: var(--deps-surface);
  overflow: hidden;
}

.deps-list-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: var(--deps-list-columns);
  column-gap: 0.6rem;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 0.42rem 0.75rem;
  background: color-mix(in srgb, var(--deps-surface) 92%, var(--fg1) 8%);
  border-bottom: 1px solid var(--deps-line);
  color: var(--deps-text-3);
  font-size: 0.66rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;

  .col-icon {
    width: 2rem;
  }

  .col-name {
    min-width: 0;
  }

  .col-version,
  .col-latest {
    min-width: 0;
    padding: 0 0.25rem;
  }

  .col-actions {
    min-width: 0;
    text-align: right;
  }
}

// ---------------------------------------------------------------------------
// 应用条

.deps-apply-bar {
  position: fixed;
  left: calc(var(--activity-width, 4rem) + var(--aside-width, 0px));
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem var(--card-margin);
  border-top: 1px solid var(--deps-line);
  background: var(--deps-surface);
  color: var(--deps-text);

  strong {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
  }

  > div > span {
    display: block;
    margin-top: 0.05rem;
    color: var(--deps-text-3);
    font-size: 0.76rem;
    line-height: 1.4;
  }
}

.deps-apply-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.5rem;

  .el-button {
    margin-left: 0;
    border-radius: 6px;
  }
}

// ---------------------------------------------------------------------------
// 动效：仅在“精致”模式保留很轻的入场与浮层阴影。

.page-deps.market-mode-polished,
.market-mode-polished .page-deps {
  .deps-group {
    animation: deps-group-in 200ms var(--deps-ease) both;
  }

  .deps-group:nth-child(2) {
    animation-delay: 25ms;
  }

  .deps-group:nth-child(3) {
    animation-delay: 50ms;
  }

  .deps-group:nth-child(n + 4) {
    animation-delay: 75ms;
  }

  .dep-package-card:hover {
    box-shadow: 0 10px 26px -22px rgb(0 0 0 / 60%);
  }

  .dep-package-card.expanded {
    box-shadow: 0 14px 34px -26px rgb(0 0 0 / 65%);
  }
}

.deps-apply-bar.market-mode-polished {
  box-shadow: 0 -10px 26px -24px rgb(0 0 0 / 55%);
}

@keyframes deps-group-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes deps-loading {
  from {
    transform: translateX(-100%);
  }

  to {
    transform: translateX(285%);
  }
}

// ---------------------------------------------------------------------------
// 响应式

@media (max-width: 1100px) {
  .deps-toolbar-row {
    flex-wrap: wrap;
  }

  .deps-search {
    flex: 1 1 12rem;
  }
}

@media (max-width: 1100px) {
  .deps-layout-list .deps-grid {
    --deps-list-columns: 1.8rem minmax(0, 1fr) 5.5rem 6rem 11rem;
  }
}

@media (max-width: 768px) {
  .deps-search {
    flex: 1 1 100%;
    order: 5;
  }

  .deps-filter-select {
    flex: 0 1 auto;
    max-width: 13rem;
  }

  .deps-filter-select .el-select__wrapper {
    min-height: 2rem;
  }
}

@media (max-width: 768px) {
  .deps-layout-list .deps-grid {
    border: 0;
    border-radius: 0;
    background: transparent;
    overflow: visible;
  }

  .deps-list-header {
    display: none;
  }
}

@media (max-width: 560px) {
  .deps-group-header {
    .deps-group-heading {
      gap: 0.4rem;
    }

    p {
      display: none;
    }
  }

  .deps-filter span {
    display: none;
  }

  .deps-filter {
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
  }

  .deps-filter-select {
    flex: 1 1 auto;
    max-width: none;
  }

  .deps-filter-select .el-select__wrapper {
    min-height: 2.5rem;
  }
}

@media (max-width: 768px) {
  .deps-apply-bar {
    left: 0;
  }
}

@media (max-width: 640px) {
  .deps-apply-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 0.6rem;
  }

  .deps-apply-actions .el-button {
    flex: 1 1 0;
  }
}

@media (max-width: 420px) {
  .deps-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-deps *,
  .deps-apply-bar * {
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
  }

  .deps-loading::after {
    width: 100%;
    opacity: 0.5;
    animation: none !important;
    transform: none;
  }
}
</style>

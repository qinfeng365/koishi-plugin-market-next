<template>
  <k-layout main="page-deps" :class="['page-dependencies', modeClass, `deps-layout-${depsLayout}`]" menu="dependencies">
    <div class="deps-toolbar">
      <el-input
        ref="searchInput"
        v-model="keyword"
        class="deps-search"
        clearable
        :placeholder="t('dependencies.toolbar.searchPlaceholder')"
      >
        <template #prefix><k-icon name="search"></k-icon></template>
      </el-input>
      <el-select v-model="filter" class="deps-filter-select">
        <el-option
          v-for="option in filterOptions"
          :key="option.value"
          :value="option.value"
          :label="option.count ? `${option.label} (${option.count})` : option.label"
        >
          <span class="deps-filter-option">
            <k-icon v-if="option.icon.startsWith('market-next:')" :name="option.icon"></k-icon>
            <market-icon v-else :name="option.icon"></market-icon>
            <span>{{ option.label }}</span>
            <span v-if="option.count" class="deps-filter-count">{{ option.count }}</span>
          </span>
        </el-option>
      </el-select>
      <el-checkbox :model-value="prereleaseBlocked" @change="togglePrereleaseFilter">
        {{ t('dependencies.toolbar.blockPreview') }}
      </el-checkbox>
      <span v-if="isRegistryRefreshing()" class="deps-loading">{{ t('dependencies.toolbar.loading') }}</span>
      <div class="deps-layout-switch" role="group" :aria-label="t('dependencies.toolbar.layout')">
        <button
          v-for="mode in (['grid', 'list'] as const)"
          :key="mode"
          :class="{ active: depsLayout === mode }"
          :title="mode === 'grid' ? t('dependencies.toolbar.gridView') : t('dependencies.toolbar.listView')"
          :aria-pressed="depsLayout === mode"
          @click="setLayout(mode)"
        >
          <svg v-if="mode === 'grid'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4 5h16v2H4V5zm0 6h16v2H4v-2zm0 6h16v2H4v-2z"/>
          </svg>
        </button>
      </div>
    </div>

    <el-scrollbar class="body-container">
      <div class="deps-content">
        <template v-if="visibleGroups.length">
          <section v-for="group in visibleGroups" :key="group.key" :class="['deps-group', `is-${group.key}`]">
            <header
              :class="['deps-group-header', { collapsible: group.collapsible }]"
              :role="group.collapsible ? 'button' : undefined"
              :tabindex="group.collapsible ? 0 : undefined"
              :aria-expanded="group.collapsible ? String(!group.collapsed) : undefined"
              @click="group.collapsible && toggleGroup(group.key)"
              @keydown.enter.prevent="group.collapsible && toggleGroup(group.key)"
              @keydown.space.prevent="group.collapsible && toggleGroup(group.key)"
            >
              <k-icon v-if="group.collapsible" :class="['deps-group-chevron', { expanded: !group.collapsed }]" name="chevron-right"></k-icon>
              <h2>{{ group.label }}</h2>
              <span class="deps-group-count">{{ group.items.length }}</span>
              <p>{{ group.description }}</p>
            </header>
            <div v-if="!group.collapsed" :class="depsLayout === 'list' ? 'deps-list' : 'deps-grid'">
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
        <empty-state v-else class="deps-empty" icon="market-next:search-empty" :title="t('dependencies.empty')" :description="t('dependencies.emptyHint')"></empty-state>
      </div>
    </el-scrollbar>

    <div v-if="summary.pending" class="deps-apply-bar">
      <div class="deps-apply-text">
        <strong>{{ t('dependencies.apply.count', { count: summary.pending }) }}</strong>
        <span>{{ t('dependencies.apply.description') }}</span>
      </div>
      <div class="deps-apply-actions">
        <el-button @click="clearChanges">{{ t('dependencies.apply.discard') }}</el-button>
        <el-button type="primary" @click="showConfirm = true">{{ t('dependencies.apply.apply') }}</el-button>
      </div>
    </div>
  </k-layout>

  <manual-install/>
  <dependency-dialogs/>
  <dependency-menu/>
</template>

<script lang="ts" setup>

import { computed, onBeforeUnmount, onMounted, ref, watch, WatchStopHandle } from 'vue'
import { message, router, store, useConfig, useContext } from '@koishijs/client'
import { useMarketNextI18n } from '../i18n'
import { getCollapsedGroups, getFrontendMode, getDepsLayout, getLatestVersion, getMarketNextConfig, getMarketNextPolicy, getPendingOverrides, getWritableMarketNextPolicy, hasUpdate, isUpdateCheckDisabled, isUpdateIgnored, patchMarketNextConfig, patchMarketNextData } from '../utils'
import { addManual, configuredPlugins, findBundleRecord, getConfigWriter, getRegistryStatus, pendingBundleUninstalls, showConfirm } from './utils'
import ManualInstall from './manual.vue'
import DependencyDialogs from './dependency-dialogs.vue'
import DependencyMenu from './dependency-menu.vue'
import PackageView from './package.vue'
import EmptyState from './empty-state.vue'
import MarketIcon from '../market/icons'
import { getPluginShortname, PLUGIN_PACKAGE_RE } from '../../src/shared/bundle'
import { shouldIncludeDiscoveredLocalPlugin } from '../../src/shared/dependency-source'
import { loadMarketObjects } from '../market/state'
import { isRegistryRefreshing } from '../registry-state'

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
const depsLayout = computed(() => getDepsLayout(config.value))
const modeClass = computed(() => `market-mode-${getFrontendMode(config.value)}`)

function isManageableBundle(name: string) {
  return !!findBundleRecord(name)
}

const names = computed(() => {
  const explicit: Record<string, unknown> = {
    ...(store.dependencies ?? {}),
    ...getPendingOverrides(),
  }
  for (const name of Object.keys(store.packages ?? {})) {
    const pkg = store.packages?.[name]
    if (isUnconfigured(name)
      || isManageableBundle(name)
      || PLUGIN_PACKAGE_RE.test(name) && shouldIncludeDiscoveredLocalPlugin({
        declared: !!store.dependencies?.[name],
        configured: configuredPlugins.value.has(getPluginShortname(name)),
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

function classify(name: string): ItemKind {
  const dep = store.dependencies?.[name]
  if (Object.prototype.hasOwnProperty.call(getPendingOverrides(), name)) return 'pending'
  if (!dep) return store.packages?.[name] ? 'local' : 'manual'
  if (dep.local || dep.workspace) return 'local'
  if (dep.invalid) return 'invalid'
  if (isManageableBundle(name)) return 'bundle'
  if (isUnconfigured(name)) return 'unconfigured'
  if (getRegistryStatus(name)?.error) return 'error'
  const policy = getMarketNextPolicy(config.value)
  if (isUpdateCheckDisabled(name, policy)) return 'check-disabled'
  if (isUpdateIgnored(name, policy)) return 'ignored'
  if (hasUpdate(name, policy)) return 'updatable'
  return 'installed'
}

// Without the config plugin there is no way to add a config, so nothing counts as unconfigured.
function isUnconfigured(name: string) {
  if (isManageableBundle(name)) return false
  return !!getConfigWriter(ctx) && !!store.packages?.[name] && PLUGIN_PACKAGE_RE.test(name) && !configuredPlugins.value.has(getPluginShortname(name))
}

const items = computed<DependencyItem[]>(() => {
  return names.value.map(name => ({
    name,
    kind: classify(name),
    pending: Object.prototype.hasOwnProperty.call(getPendingOverrides(), name),
    manual: !store.dependencies?.[name] && !store.packages?.[name],
  }))
})

const updates = computed(() => items.value.filter(item => item.kind === 'updatable').map(item => item.name))


const prereleaseBlocked = computed(() => !!getMarketNextPolicy(config.value).updateIgnorePrerelease)

const summary = computed(() => {
  const counts: Record<string, number> = {
    all: items.value.length,
    pending: Object.keys(getPendingOverrides()).length,
    manual: items.value.filter(item => item.manual).length,
  }
  for (const item of items.value) {
    if (item.kind !== 'pending' && item.kind !== 'manual') counts[item.kind] = (counts[item.kind] ?? 0) + 1
  }
  return counts
})

const filterKeys: Record<FilterKey, [string, string]> = {
  all: ['all', 'solid:all'],
  pending: ['pending', 'tag'],
  bundle: ['bundle', 'layer-group'],
  unconfigured: ['unconfigured', 'preview'],
  updatable: ['updatable', 'asc'],
  ignored: ['ignored', 'market-next:bell-off'],
  'check-disabled': ['checkDisabled', 'close'],
  invalid: ['invalid', 'balance'],
  error: ['error', 'insecure'],
  local: ['local', 'portable'],
  manual: ['manual', 'search'],
}

// Empty categories are hidden so the dropdown only offers useful choices.
const filterOptions = computed(() => (Object.keys(filterKeys) as FilterKey[])
  .filter(value => value === 'all' || value === filter.value || summary.value[value])
  .map(value => ({ value, label: t(`dependencies.filters.${filterKeys[value][0]}`), icon: filterKeys[value][1], count: summary.value[value] })))

const groupOrder: ItemKind[] = ['pending', 'bundle', 'unconfigured', 'updatable', 'ignored', 'check-disabled', 'invalid', 'error', 'local', 'manual', 'installed']

const groupMeta = computed(() => Object.fromEntries(groupOrder.map(key => {
  const id = key === 'check-disabled' ? 'checkDisabled' : key
  return [key, { key, label: t(`dependencies.groups.${id}.label`), description: t(`dependencies.groups.${id}.description`) }]
})) as Record<ItemKind, Pick<DependencyGroup, 'key' | 'label' | 'description'>>)

const collapseEnabled = computed(() => filter.value === 'all' && !keyword.value.trim())

function isGroupCollapsed(key: ItemKind) {
  if (!collapseEnabled.value) return false
  return getCollapsedGroups()[key] ?? (key === 'unconfigured' || key === 'ignored')
}

function toggleGroup(key: ItemKind) {
  const groups = {
    ...getCollapsedGroups(),
    [key]: !isGroupCollapsed(key),
  }
  void patchMarketNextData({ collapsedGroups: groups })
}

async function setLayout(mode: 'grid' | 'list') {
  const previous = depsLayout.value
  if (mode === previous) return
  config.value.market ||= {}
  config.value.market.depsLayout = mode
  const plugin = getMarketNextConfig()
  if (plugin) plugin.depsLayout = mode
  if (await patchMarketNextConfig({ depsLayout: mode })) return
  config.value.market.depsLayout = previous
  if (plugin) plugin.depsLayout = previous
  message.error(t('common.messages.saveFailed'))
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
  pendingBundleUninstalls.value = {}
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
      const version = getLatestVersion(name, getMarketNextPolicy(config.value))
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
}

.deps-toolbar {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.75rem var(--card-margin);
  border-bottom: 1px solid var(--k-color-divider);

  .el-checkbox {
    margin-right: 0;
  }
}

.deps-search {
  flex: 1 1 16rem;
  min-width: 0;
  max-width: 28rem;
}

.deps-filter-select {
  flex: 0 0 10rem;
}

.deps-filter-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .market-icon,
  .k-icon {
    width: 0.875rem;
    height: 0.875rem;
    color: var(--fg3);
  }
}

.deps-filter-count {
  margin-left: auto;
  padding-left: 1rem;
  color: var(--fg3);
  font-size: 0.8125rem;
}

.deps-empty {
  margin-top: 3rem;
}

.deps-loading {
  color: var(--fg3);
  font-size: 0.875rem;
}

.deps-layout-switch {
  display: inline-flex;
  margin-left: auto;
  border: 1px solid var(--k-color-border);
  border-radius: 4px;
  overflow: hidden;

  button {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 1.875rem;
    border: 0;
    padding: 0;
    color: var(--fg3);
    background: transparent;
    cursor: pointer;

    & + button {
      border-left: 1px solid var(--k-color-border);
    }

    &:hover {
      color: var(--fg1);
    }

    &.active {
      color: var(--k-color-primary);
      background: var(--k-hover-bg);
    }
  }

  svg {
    width: 1rem;
    height: 1rem;
  }
}

.deps-content {
  padding: 1rem var(--card-margin) var(--card-margin);
}

.deps-group + .deps-group {
  margin-top: 1.5rem;
}

.deps-group-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
  margin-bottom: 0.75rem;
  user-select: none;

  &.collapsible {
    cursor: pointer;
  }

  &:focus-visible {
    outline: 2px solid var(--k-color-primary);
    outline-offset: 2px;
    border-radius: 4px;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.5;
  }

  p {
    flex: 1 1 16rem;
    margin: 0;
    color: var(--fg3);
    font-size: 0.8125rem;
    line-height: 1.5;
  }
}

.deps-group-count {
  min-width: 1.25rem;
  border-radius: 10px;
  padding: 0 0.375rem;
  color: var(--fg2);
  background: var(--k-side-bg);
  font-size: 0.75rem;
  line-height: 1.25rem;
  text-align: center;
}

.is-pending .deps-group-count {
  color: var(--k-color-primary);
  background: color-mix(in srgb, var(--k-color-primary) 12%, transparent);
}

.is-updatable .deps-group-count {
  color: var(--k-color-success);
  background: color-mix(in srgb, var(--k-color-success) 12%, transparent);
}

.is-error .deps-group-count {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.deps-group-chevron {
  width: 0.75rem;
  height: 0.75rem;
  color: var(--fg3);
  transition: transform 0.2s ease;

  &.expanded {
    transform: rotate(90deg);
  }
}

.deps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
  align-items: start;
  gap: 0.75rem;
}

// Rows draw their own top divider; the shifted first row hides its divider
// under the container border.
.deps-list {
  border: 1px solid var(--k-color-border);
  border-radius: 8px;
  overflow: hidden;

  > .dep-item {
    margin-top: -1px;
    border-top: 1px solid var(--k-color-divider);
  }
}

.deps-apply-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  padding: 0.75rem var(--card-margin);
  border-top: 1px solid var(--k-color-divider);
  background: var(--k-card-bg);

  .deps-apply-text {
    min-width: 0;
  }

  strong {
    margin-right: 0.5rem;
  }

  span {
    color: var(--fg2);
    font-size: 0.875rem;
  }
}

.deps-apply-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.5rem;

  .el-button + .el-button {
    margin-left: 0;
  }
}

@media (max-width: 768px) {
  .deps-search {
    flex-basis: 100%;
    max-width: none;
  }

  .deps-filter-select {
    flex: 1 1 8rem;
  }

  .deps-layout-switch {
    display: none;
  }

  .deps-group-header p {
    flex-basis: 100%;
  }

  .deps-apply-bar {
    flex-direction: column;
    align-items: stretch;

    strong {
      display: block;
    }
  }

  .deps-apply-actions .el-button {
    flex: 1 1 0;
  }
}

</style>

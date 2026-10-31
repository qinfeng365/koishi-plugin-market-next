import { computed, onBeforeUnmount, onMounted, ref, watch, WatchStopHandle } from 'vue'
import { message, router, store, useConfig, useContext } from '@koishijs/client'
import { useMarketNextI18n } from '../i18n'
import { getCollapsedGroups, getDepsLayout, getMarketNextConfig, getMarketNextPolicy, getPendingOverrides, getWritableMarketNextPolicy, hasUpdate, isUpdateCheckDisabled, isUpdateIgnored, patchMarketNextConfig, patchMarketNextData } from '../utils'
import { addManual, configuredPlugins, findBundleRecord, getConfigWriter, getRegistryStatus, getVersions, pendingBundleUninstalls, showConfirm } from '../components/utils'
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
  icon: string
  items: DependencyItem[]
  collapsed: boolean
  collapsible: boolean
}

export function useDependencies() {
  const config = useConfig()
  const ctx = useContext()
  const { t } = useMarketNextI18n()
  const keyword = ref('')
  const metadataLoading = ref(false)
  const dependencyLoading = computed(() => metadataLoading.value || isRegistryRefreshing())
  let metadataLoadToken = 0
  const filter = ref<FilterKey>('all')
  const searchInput = ref<{ focus?: () => void }>()
  const depsLayout = computed(() => getDepsLayout(config.value))

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
  const manualRequests = new Set<string>()
  watch(() => store.market?.registry, (registry) => {
    dispose?.()
    if (!registry) return
    dispose = watch(() => getPendingOverrides(), (object) => {
      if (!object) return
      for (const name of Object.keys(object)) {
        if (store.dependencies?.[name] || getVersions(name) || manualRequests.has(name)) continue
        manualRequests.add(name)
        void addManual(name)
          .catch(error => console.error('[market-next] failed to load pending dependency metadata', name, error))
          .finally(() => manualRequests.delete(name))
      }
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
    return [key, { key, icon: key === 'installed' ? 'installed' : filterKeys[key][1], label: t(`dependencies.groups.${id}.label`), description: t(`dependencies.groups.${id}.description`) }]
  })) as Record<ItemKind, Pick<DependencyGroup, 'key' | 'icon' | 'label' | 'description'>>)

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

  return {
    t, keyword, filter, searchInput, depsLayout, prereleaseBlocked, filterOptions, visibleGroups, toggleGroup, summary, clearChanges, setLayout, togglePrereleaseFilter, showConfirm, dependencyLoading,
  }
}

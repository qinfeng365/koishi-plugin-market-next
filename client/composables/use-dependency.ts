import { computed, onBeforeUnmount, ref } from 'vue'
import { message, store, useConfig, useContext } from '@koishijs/client'
import type { SearchObject } from '@koishijs/registry'
import { getPluginShortname, isBundlePackageName, PLUGIN_PACKAGE_RE } from '../../src/shared/bundle'
import { isLocalDependency } from '../../src/shared/dependency-source'
import { getBundleRecords, getMarketNextPolicy, getOfferedVersion, getPendingOverrides, getUpdateIgnoreText, getWritableMarketNextPolicy, hasUpdate, isUpdateCheckDisabled, isUpdateIgnored, patchMarketNextData, persistUpdatePolicy } from '../utils'
import { activeBundle, analyzeVersions, bindingLocalPackages, configuredPlugins, dependencyDialog, dependencyMenu, DependencyMenuItem, ensureInstalledConfig, expandedDependency, findBundleRecord, formatEndpoint, formatShortname, getConfigWriter, getInstalledVersion, getRegistryStatus, getRegistryStatusText, getVersions, pendingBundleUninstalls, setPendingVersion } from '../components/utils'
import { resolveCategory } from '../market/utils'
import { useMarketNextI18n } from '../i18n'
import { getMarketObject } from '../market/state'

export interface DependencyProps {
  name: string
  kind?: 'pending' | 'bundle' | 'unconfigured' | 'updatable' | 'ignored' | 'check-disabled' | 'invalid' | 'error' | 'local' | 'manual' | 'installed'
  listMode?: boolean
}

type ItemKind = NonNullable<DependencyProps['kind']>

export function useDependency(props: DependencyProps) {
  const removeValue = '__market_next_remove__'
  const config = useConfig()
  const ctx = useContext()
  const { t, locale } = useMarketNextI18n()
  const configuring = ref(false)
  const editing = computed({
    get: () => expandedDependency.value === props.name,
    set: (value: boolean) => expandedDependency.value = value ? props.name : '',
  })
  const menuAnchor = ref<HTMLElement>()
  const menuOpen = computed(() => dependencyMenu.open && dependencyMenu.anchor === menuAnchor.value)

  const dep = computed(() => store.dependencies?.[props.name])
  const local = computed(() => store.packages?.[props.name])
  const localDependency = computed(() => {
    return isLocalDependency(dep.value)
      || props.kind === 'local' && !dep.value && !!local.value
  })
  const bundleRecord = computed(() => findBundleRecord(props.name))

  const displayName = computed(() => formatShortname(props.name))

  // The plugin name opens its homepage and the package name opens npm. Local and workspace
  // packages may differ from the published one, so they get neither link.
  const published = computed(() => !localDependency.value && !dep.value?.workspace && !local.value?.workspace)
  const marketLinks = computed(() => getMarketObject(props.name)?.package?.links)

  const homepageLink = computed(() => {
    if (!published.value) return
    const { homepage, repository } = marketLinks.value ?? {}
    const url = [homepage, repository].find(url => /^(git\+)?https?:\/\//.test(url ?? ''))
    return url?.replace(/^git\+/, '').replace(/\.git$/, '')
  })

  const npmLink = computed(() => {
    if (!published.value || !marketLinks.value && !store.registry?.[props.name]) return
    const url = marketLinks.value?.npm
    return url && /^https?:\/\//.test(url) ? url : `https://www.npmjs.com/package/${props.name}`
  })

  // Without a separate package name line, the title falls back to npm.
  const titleLink = computed(() => homepageLink.value || (displayName.value === props.name ? npmLink.value : undefined))

  const icon = computed(() => {
    if (isBundlePackageName(props.name)) return 'layer-group'
    const category = getMarketObject(props.name)?.category
    if (category) return `solid:${resolveCategory(category)}`
    return props.name.includes('adapter-') ? 'solid:adapter' : 'solid:other'
  })

  // Checking peers for every version is costly, so only the picker reads `data`; everything else uses this.
  const hasVersions = computed(() => {
    if (localDependency.value || dep.value?.invalid) return false
    return !!getVersions(props.name)
  })

  const data = computed(() => {
    if (!hasVersions.value) return
    return analyzeVersions(props.name, (name) => getPendingOverrides()[name])
  })

  const status = computed(() => getRegistryStatus(props.name))

  const latestVersion = computed(() => getOfferedVersion(props.name, getMarketNextPolicy(config.value)))

  const overrideValue = computed(() => {
    const override = getPendingOverrides()
    if (!Object.prototype.hasOwnProperty.call(override, props.name)) return
    return override[props.name]
  })

  const pending = computed(() => overrideValue.value !== undefined)
  const pendingRemove = computed(() => pending.value && !overrideValue.value)
  const updateCheckDisabled = computed(() => isUpdateCheckDisabled(props.name, getMarketNextPolicy(config.value)))
  const ignoredUpdate = computed(() => updateCheckDisabled.value || isUpdateIgnored(props.name, getMarketNextPolicy(config.value)))
  const updatable = computed(() => !!hasUpdate(props.name, getMarketNextPolicy(config.value)))
  const bundlePackage = computed(() => !!bundleRecord.value)
  const unconfigured = computed(() => {
    if (bundlePackage.value) return false
    const writer = getConfigWriter(ctx)
    return !!writer && !!local.value && PLUGIN_PACKAGE_RE.test(props.name) && !configuredPlugins.value.has(getPluginShortname(props.name))
  })

  const selectedVersion = computed({
    get() {
      if (pendingRemove.value) return removeValue
      if (overrideValue.value) return overrideValue.value
      return dep.value?.resolved ?? latestVersion.value ?? ''
    },
    set(value: string) {
      setPendingVersion(props.name, value === removeValue ? '' : !value && !dep.value ? undefined : value)
    },
  })

  const statusClass = computed<ItemKind>(() => {
    if (pending.value) return 'pending'
    if (localDependency.value) return 'local'
    if (dep.value?.invalid) return 'invalid'
    if (bundlePackage.value && (dep.value || local.value)) return 'bundle'
    if (unconfigured.value) return 'unconfigured'
    if (status.value?.error) return 'error'
    if (!dep.value && !local.value) return 'manual'
    if (updateCheckDisabled.value) return 'check-disabled'
    if (ignoredUpdate.value) return 'ignored'
    if (updatable.value) return 'updatable'
    return props.kind ?? 'installed'
  })

  const statusLabel = computed(() => {
    if (pendingRemove.value) return t('dependencyCard.status.pendingRemove')
    if (pending.value && dep.value) return t('dependencyCard.status.pendingApply')
    if (pending.value) return t('dependencyCard.status.pendingInstall')
    if (localDependency.value) return t('dependencyCard.status.local')
    if (dep.value?.invalid) return t('dependencyCard.status.unsupported')
    if (bundlePackage.value && (dep.value || local.value)) return t('dependencyCard.status.bundle')
    if (unconfigured.value) return t('dependencyCard.status.unconfigured')
    if (status.value?.error) return t('dependencyCard.status.versionError')
    if (!dep.value && !local.value) return t('dependencyCard.status.manual')
    if (updateCheckDisabled.value) return t('dependencyCard.status.checkDisabled')
    if (ignoredUpdate.value) return t('dependencyCard.status.ignored')
    if (updatable.value) return t('dependencyCard.status.updatable')
    return t('dependencyCard.status.installed')
  })

  const currentText = computed(() => {
    if (!dep.value) return local.value?.package.version ?? t('dependencyCard.current.notInstalled')
    if (localDependency.value) return dep.value.resolved ? `${dep.value.resolved} · ${t('dependencyCard.current.local')}` : t('dependencyCard.current.local')
    return dep.value.resolved ?? t('dependencyCard.current.installError')
  })

  const installedVersion = computed(() => getInstalledVersion(props.name))

  const showTarget = computed(() => {
    if (pending.value || updatable.value) return true
    if (updateCheckDisabled.value) return false
    return ignoredUpdate.value || !dep.value && !local.value
  })

  const targetText = computed(() => {
    if (pendingRemove.value) return t('dependencyCard.target.remove')
    return overrideValue.value || latestVersion.value || t('dependencyCard.target.waitingInstall')
  })

  const sourceText = computed(() => {
    const origin = Object.values(getBundleRecords(config.value)).find(record => record?.members?.some(member => member.package === props.name))
    if (origin) return t('dependencyCard.source.bundle', { name: origin.label || formatShortname(origin.package) })
    if (bundleRecord.value) return t('dependencyCard.source.bundleSelf')
    if (dep.value?.source) return t(`dependencyCard.source.${dep.value.source}`)
    if (dep.value?.workspace || local.value?.workspace) return t('dependencyCard.source.workspace')
    if (localDependency.value || !dep.value && local.value) return t('dependencyCard.source.local')
    return ''
  })

  // Rarely needed details live in the tooltip so the card itself stays short.
  const versionTitle = computed(() => {
    const lines: string[] = []
    if (dep.value?.request && dep.value.request !== dep.value.resolved) lines.push(`${t('common.labels.range')}: ${dep.value.request}`)
    if (sourceText.value) lines.push(`${t('common.labels.source')}: ${sourceText.value}`)
    if (status.value?.endpoint) lines.push(`${t('common.labels.versionSource')}: ${formatEndpoint(status.value.endpoint)}`)
    return lines.join('\n')
  })

  const detailText = computed(() => {
    if (pendingRemove.value) return t('dependencyCard.detail.pendingRemove')
    if (pending.value) return dep.value ? '' : t('dependencyCard.detail.pendingInstall')
    if (localDependency.value) {
      if (!dep.value) return t('dependencyCard.detail.localDiscovered')
      return dep.value.bound === false
        ? t('dependencyCard.detail.localUnbound')
        : t('dependencyCard.detail.local')
    }
    if (dep.value?.invalid) return t('dependencyCard.detail.unsupported')
    if (bundlePackage.value && (dep.value || local.value)) return t('dependencyCard.detail.bundle')
    if (unconfigured.value) return t('dependencyCard.detail.unconfigured')
    if (status.value?.error || !hasVersions.value) return getRegistryStatusText(props.name)
    if (updateCheckDisabled.value) return t('dependencyCard.detail.checkDisabled')
    if (ignoredUpdate.value) return getUpdateIgnoreText(props.name, getMarketNextPolicy(config.value)) || t('dependencyCard.detail.ignored')
    return ''
  })

  const compactStatusText = computed(() => {
    return status.value?.loading || !status.value ? t('dependencyCard.detail.fetching') : t('dependencyCard.detail.noData')
  })

  const summaryText = computed(() => {
    const market = getMarketObject(props.name)
    const keys = locale.value.toLowerCase().startsWith('zh') ? ['zh-CN', 'zh', 'en-US', 'en'] : ['en-US', 'en', 'zh-CN', 'zh']
    for (const value of [market?.manifest?.description, market?.package?.description, local.value?.package?.description]) {
      const text = !value || typeof value === 'string' ? value : keys.map(key => value[key]).find(item => item?.trim()) ?? Object.values(value).find(item => item?.trim())
      if (text?.trim()) return text.trim()
    }
    return ''
  })

  // The group header already names the state, so the tag only appears when it adds something.
  const showTag = computed(() => {
    if (statusClass.value === 'installed') return false
    return statusClass.value !== props.kind || pendingRemove.value || pending.value && !dep.value
  })

  const showDetailText = computed(() => {
    if (!detailText.value || statusClass.value === 'installed') return false
    // These details only repeat the group description.
    return statusClass.value !== props.kind || !['unconfigured', 'bundle', 'invalid', 'check-disabled'].includes(statusClass.value)
  })

  const showVersionControl = computed(() => {
    if (localDependency.value) return false
    if (!hasVersions.value && !status.value?.error) return false
    return editing.value || pending.value || statusClass.value === 'error' || statusClass.value === 'manual'
  })

  const showPicker = computed(() => showVersionControl.value && hasVersions.value)

  const showManageBundle = computed(() => bundlePackage.value && !!(dep.value || local.value) && !pending.value)

  const showQuickUpdate = computed(() => {
    return !pending.value && !unconfigured.value && updatable.value && !!latestVersion.value && !localDependency.value
  })

  const showRestoreUpdate = computed(() => !pending.value && !localDependency.value && ignoredUpdate.value)

  const showConfigure = computed(() => !pending.value && unconfigured.value)

  const showBindLocal = computed(() => !pending.value && dep.value?.source === 'unbound' && dep.value?.bound === false)

  const menuItems = computed(() => {
    const items: DependencyMenuItem[] = []
    if (!bundlePackage.value && !pending.value && !localDependency.value && hasVersions.value && !['error', 'manual'].includes(statusClass.value)) {
      items.push({ command: 'version', icon: 'market-next:switch', label: editing.value ? t('dependencyCard.actions.hideVersions') : t('dependencyCard.actions.pickVersion') })
    }
    if (dep.value?.resolved && !localDependency.value && !dep.value.invalid) {
      items.push({ command: 'history', icon: 'market-next:history', label: t('dependencyCard.actions.history') })
    }
    if (showQuickUpdate.value) items.push({ command: 'ignore', icon: 'market-next:bell-off', label: t('dependencyCard.actions.ignore') })
    if (!pending.value && dep.value && !dep.value.workspace && !dep.value.invalid) {
      items.push({
        command: 'remove',
        icon: 'market-next:trash',
        label: bundleRecord.value ? t('dependencyCard.actions.uninstallBundle') : t('dependencyCard.actions.uninstall'),
        danger: true,
      })
    }
    return items
  })

  const showActions = computed(() => {
    return pending.value || showQuickUpdate.value || showConfigure.value || showBindLocal.value
      || showRestoreUpdate.value || showManageBundle.value
  })

  function toggleMenu() {
    if (menuOpen.value) {
      dependencyMenu.open = false
      return
    }
    Object.assign(dependencyMenu, { open: true, anchor: menuAnchor.value, items: () => menuItems.value, select: onCommand })
  }

  onBeforeUnmount(() => {
    if (menuOpen.value) dependencyMenu.open = false
  })

  function onCommand(command: string) {
    if (command === 'version') editing.value = !editing.value
    if (command === 'history') Object.assign(dependencyDialog, { type: 'history', name: props.name })
    if (command === 'ignore') Object.assign(dependencyDialog, { type: 'ignore', name: props.name })
    if (command !== 'remove') return
    if (bundleRecord.value) {
      Object.assign(dependencyDialog, { type: 'bundle-uninstall', name: props.name })
      return
    }
    selectedVersion.value = removeValue
  }

  function openBundlePanel() {
    activeBundle.value = getMarketObject(props.name) ?? {
      package: {
        name: props.name,
        version: installedVersion.value || latestVersion.value || '',
        keywords: [],
      },
      shortname: displayName.value,
    } as SearchObject
  }

  function clearOverride() {
    const override = getPendingOverrides()
    delete override[props.name]
    for (const member of pendingBundleUninstalls.value[props.name]?.members ?? []) {
      delete override[member]
    }
    void patchMarketNextData({ override: { ...override } })
    delete pendingBundleUninstalls.value[props.name]
  }

  async function restoreUpdate() {
    const policy = getWritableMarketNextPolicy(config.value)
    delete policy.updateIgnored?.[props.name]
    policy.updateIgnoredPackages = (policy.updateIgnoredPackages ?? '')
      .split(/[\s,，;；]+/g)
      .filter(item => item && item.toLowerCase() !== props.name.toLowerCase())
      .join('\n')
    if (!await persistUpdatePolicy()) message.error(t('common.messages.saveFailed'))
  }

  async function configure() {
    configuring.value = true
    try {
      await ensureInstalledConfig(ctx, props.name, false)
    } finally {
      configuring.value = false
    }
  }

  return {
    t,
    removeValue,
    configuring,
    editing,
    menuAnchor,
    menuOpen,
    dep,
    localDependency,
    displayName,
    npmLink,
    titleLink,
    icon,
    hasVersions,
    data,
    status,
    latestVersion,
    pending,
    pendingRemove,
    ignoredUpdate,
    updatable,
    bundlePackage,
    unconfigured,
    selectedVersion,
    statusClass,
    statusLabel,
    currentText,
    showTarget,
    targetText,
    versionTitle,
    detailText,
    compactStatusText,
    summaryText,
    showTag,
    showDetailText,
    showVersionControl,
    showPicker,
    showManageBundle,
    showQuickUpdate,
    showRestoreUpdate,
    showConfigure,
    showBindLocal,
    menuItems,
    showActions,
    toggleMenu,
    onCommand,
    openBundlePanel,
    clearOverride,
    restoreUpdate,
    configure,
    bindingLocalPackages,
    dependencyDialog,
  }
}

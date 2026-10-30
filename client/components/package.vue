<template>
  <article :class="['dep-item', listMode ? 'is-row' : 'is-card', `is-${statusClass}`]">
    <div class="dep-icon" aria-hidden="true">
      <market-icon :name="icon"></market-icon>
    </div>

    <div class="dep-main">
      <div class="dep-title">
        <h3 :title="name">
          <a v-if="titleLink" :href="titleLink" :title="titleLink" target="_blank" rel="noopener noreferrer">{{ displayName }}</a>
          <template v-else>{{ displayName }}</template>
        </h3>
        <span v-if="showTag" :class="['dep-tag', `is-${statusClass}`]">{{ statusLabel }}</span>
      </div>
      <a v-if="displayName !== name && npmLink" class="dep-name" :href="npmLink" :title="npmLink" target="_blank" rel="noopener noreferrer">{{ name }}</a>
      <span v-else-if="displayName !== name" class="dep-name" :title="name">{{ name }}</span>
      <!-- Rendered even when empty so every card has the same height. -->
      <p v-if="!listMode" class="dep-summary" :title="summaryText">{{ summaryText }}</p>
    </div>

    <p v-if="listMode && summaryText" class="dep-summary" :title="summaryText">{{ summaryText }}</p>

    <!-- The picker takes the place of the target version, so the row keeps its shape while editing. -->
    <div class="dep-version" :title="versionTitle">
      <span>{{ currentText }}</span>
      <template v-if="showPicker">
        <span class="dep-arrow">→</span>
        <version-picker
          v-model="selectedVersion"
          :versions="data"
          :current="dep?.resolved"
          :latest="latestVersion"
          :removable="!!dep"
          :pending="pending"
          :placeholder="t('dependencyCard.picker.placeholder')"
          :remove-value="removeValue"
          :mode-class="modeClass"
        ></version-picker>
      </template>
      <template v-else-if="showTarget">
        <span class="dep-arrow">→</span>
        <strong :class="{ 'is-remove': pendingRemove }">{{ targetText }}</strong>
      </template>
      <span v-if="showVersionControl && !hasVersions" class="dep-muted">{{ compactStatusText }}</span>
    </div>

    <p v-if="showDetailText" :class="['dep-detail', { 'is-danger': statusClass === 'error' }]">{{ detailText }}</p>

    <div v-if="showActions" class="dep-actions">
      <el-button v-if="pending" size="small" @click="clearOverride">{{ t('dependencyCard.actions.undo') }}</el-button>
      <el-button v-if="showQuickUpdate" size="small" type="primary" @click="selectedVersion = latestVersion">
        {{ t('dependencyCard.actions.update') }}
      </el-button>
      <el-button v-if="showConfigure" size="small" type="primary" :loading="configuring" @click="configure">
        {{ t('dependencyCard.actions.addConfig') }}
      </el-button>
      <el-button v-if="showBindLocal" size="small" type="primary" :loading="bindingLocalPackages.has(name)" @click="Object.assign(dependencyDialog, { type: 'local-binding', name })">
        {{ t('dependencyCard.actions.bindLocal') }}
      </el-button>
      <el-button v-if="showRestoreUpdate" size="small" @click="restoreUpdate">{{ t('dependencyCard.actions.restorePrompt') }}</el-button>
      <el-button v-if="showManageBundle" size="small" @click="openBundlePanel">{{ t('dependencyCard.actions.manage') }}</el-button>
    </div>

    <!-- The menu itself is shared by all cards, see dependency-menu.vue. -->
    <div v-if="menuItems.length" ref="menuAnchor" class="dep-menu">
      <el-button
        size="small"
        class="dep-more"
        :title="t('dependencyCard.actions.more')"
        :aria-label="t('dependencyCard.actions.more')"
        aria-haspopup="menu"
        :aria-expanded="String(menuOpen)"
        @click="toggleMenu"
      >
        <k-icon name="activity:ellipsis"></k-icon>
      </el-button>
    </div>
  </article>
</template>

<script lang="ts" setup>

import { computed, onBeforeUnmount, ref } from 'vue'
import { message, store, useConfig, useContext } from '@koishijs/client'
import type { SearchObject } from '@koishijs/registry'
import { getPluginShortname, isBundlePackageName, PLUGIN_PACKAGE_RE } from '../../src/shared/bundle'
import { isLocalDependency } from '../../src/shared/dependency-source'
import { getBundleRecords, getFrontendMode, getMarketNextPolicy, getOfferedVersion, getPendingOverrides, getUpdateIgnoreText, getWritableMarketNextPolicy, hasUpdate, isUpdateCheckDisabled, isUpdateIgnored, patchMarketNextData, persistUpdatePolicy } from '../utils'
import { activeBundle, analyzeVersions, bindingLocalPackages, configuredPlugins, dependencyDialog, dependencyMenu, DependencyMenuItem, ensureInstalledConfig, expandedDependency, findBundleRecord, formatEndpoint, formatShortname, getConfigWriter, getInstalledVersion, getRegistryStatus, getRegistryStatusText, getVersions, pendingBundleUninstalls, setPendingVersion } from './utils'
import { resolveCategory } from '../market/utils'
import MarketIcon from '../market/icons'
import VersionPicker from './version-picker.vue'
import { useMarketNextI18n } from '../i18n'
import { getMarketObject } from '../market/state'

type ItemKind = 'pending' | 'bundle' | 'unconfigured' | 'updatable' | 'ignored' | 'check-disabled' | 'invalid' | 'error' | 'local' | 'manual' | 'installed'

const props = defineProps<{
  name: string
  kind?: ItemKind
  listMode?: boolean
}>()

const removeValue = '__market_next_remove__'
const config = useConfig()
const ctx = useContext()
const { t, locale } = useMarketNextI18n()
const modeClass = computed(() => `market-mode-${getFrontendMode(config.value)}`)
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

</script>

<style lang="scss" scoped>

.dep-item {
  min-width: 0;
  box-sizing: border-box;
  background: var(--k-card-bg);
}

.dep-icon {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 6px;
  color: var(--fg2);
  background: var(--k-side-bg);

  .market-icon {
    width: 1rem;
    height: 1rem;
  }
}

.dep-main {
  min-width: 0;
}

.dep-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;

  h3 {
    margin: 0;
    min-width: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    a {
      color: inherit;
      text-decoration: none;
    }
  }
}

.dep-title h3 a:hover,
a.dep-name:hover {
  color: var(--k-color-primary);
  text-decoration: underline;
}

.dep-tag {
  flex: 0 0 auto;
  border-radius: 4px;
  padding: 0 0.375rem;
  color: var(--fg2);
  background: var(--k-side-bg);
  font-size: 0.75rem;
  line-height: 1.25rem;
  white-space: nowrap;

  &.is-pending,
  &.is-manual {
    color: var(--k-color-primary);
    background: color-mix(in srgb, var(--k-color-primary) 12%, transparent);
  }

  &.is-updatable {
    color: var(--k-color-success);
    background: color-mix(in srgb, var(--k-color-success) 12%, transparent);
  }

  &.is-error {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }

  &.is-unconfigured,
  &.is-invalid,
  &.is-local {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 12%, transparent);
  }
}

.dep-name {
  display: block;
  width: fit-content;
  max-width: 100%;
  text-decoration: none;
  color: var(--fg3);
  font-size: 0.8125rem;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dep-summary {
  margin: 0;
  color: var(--fg2);
  font-size: 0.8125rem;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dep-version {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.375rem;
  min-width: 0;
  color: var(--fg2);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;

  > span,
  strong {
    white-space: nowrap;
  }

  strong {
    color: var(--fg1);
    font-weight: 600;
  }

  .dep-arrow {
    color: var(--fg3);
  }

  .is-remove {
    color: var(--danger);
  }
}

.is-updatable .dep-version strong {
  color: var(--k-color-success);
}

.is-pending .dep-version strong:not(.is-remove) {
  color: var(--k-color-primary);
}

.dep-detail {
  margin: 0;
  color: var(--fg2);
  font-size: 0.8125rem;
  line-height: 1.5;
  overflow-wrap: anywhere;

  &.is-danger {
    color: var(--danger);
  }
}

.dep-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;

  .el-button + .el-button {
    margin-left: 0;
  }
}

.dep-muted {
  color: var(--fg3);
  font-size: 0.8125rem;
}

.dep-more {
  padding: 0 0.5rem;

  .k-icon {
    width: 1rem;
    height: 1rem;
  }
}

.dep-icon { grid-area: icon; }
.dep-main { grid-area: main; }
.dep-version { grid-area: version; }
.dep-detail { grid-area: detail; }
.dep-actions { grid-area: actions; }
.dep-menu {
  grid-area: menu;
  justify-self: end;
}

.is-row > .dep-summary { grid-area: summary; }

.is-card .dep-summary {
  min-height: 1.5em;
  margin-top: 0.25rem;
}

@mixin card-layout {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) auto;
  grid-template-areas:
    'icon main menu'
    'icon version actions'
    'icon detail detail';
  column-gap: 0.75rem;
  align-content: start;
  align-items: center;
  padding: 0.75rem 0.875rem;

  .dep-icon,
  .dep-menu {
    align-self: start;
  }

  // Empty grid rows would still add a gap, so spacing goes on the items.
  .dep-version,
  .dep-actions,
  .dep-detail {
    margin-top: 0.375rem;
  }
}

.is-card {
  @include card-layout;
  border: 1px solid var(--k-color-border);
  border-radius: 8px;
}

// Fixed columns keep versions and buttons aligned from row to row.
.is-row {
  display: grid;
  grid-template-columns: 2rem minmax(10rem, 2fr) minmax(0, 3fr) 14rem 7rem 2.25rem;
  // The icon spans both rows; without a minimum, a one-line title leaves its extra height
  // to the empty detail row and sits above center. 2.5rem matches a title plus package name.
  grid-template-rows: minmax(2.5rem, auto) auto;
  grid-template-areas:
    'icon main summary version actions menu'
    'icon detail detail detail detail detail';
  column-gap: 1rem;
  align-items: center;
  padding: 0.5rem 1rem;

  > .dep-summary {
    color: var(--fg3);
  }

  .dep-version {
    flex-wrap: nowrap;
  }

  .dep-detail {
    margin-top: 0.125rem;
  }

  // Without a menu, the buttons take its column so the row doesn't end in a gap.
  .dep-actions:last-child {
    grid-column: actions / -1;
  }
}

@media (max-width: 768px) {
  .is-row {
    @include card-layout;

    > .dep-summary {
      display: none;
    }

    .dep-actions:last-child {
      grid-area: actions;
    }
  }
}

</style>

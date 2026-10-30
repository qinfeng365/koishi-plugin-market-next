<template>
  <market-dialog :model-value="!!active" @update:model-value="closePanel" :class="['install-panel', modeClass]" width="720px" destroy-on-close>
    <template v-if="active" #header="{ titleId, titleClass }">
      <span :id="titleId" :class="titleClass">
        {{ active + (localSelection ? ` (${t('dependencyCard.current.local')})` : '') }}
      </span>
      <version-picker
        v-if="data"
        v-model="selectVersion"
        :versions="data"
        :current="current"
        :latest="Object.keys(data).find(item => !item.includes('-'))"
        :disabled="localSelection"
        :mode-class="modeClass"
      ></version-picker>
    </template>

    <k-comment class="danger" v-if="danger" type="danger"><p>{{ danger }}</p></k-comment>
    <k-comment class="warning" v-if="warning" type="warning"><p>{{ warning }}</p></k-comment>

    <div v-if="!data && active && !localSelection">
      <!-- The dependency card keeps showing an earlier error while it is fetched again; this dialog shows the fetch it waits for. -->
      <k-comment :type="registryStatus?.error && !registryStatus.loading ? 'danger' : 'primary'"><p>{{ registryStatusText }}</p></k-comment>
    </div>

    <k-comment v-if="store.dependencies?.[active] && !current" type="danger">
      <p>{{ t('operations.install.installErrorHint') }}</p>
    </k-comment>

    <el-scrollbar v-if="data?.[version] && Object.keys(data[version].peers).length" class="peer-table-scroll">
      <table class="peer-table">
        <colgroup>
          <col class="peer-name-col">
          <col class="peer-range-col">
          <col class="peer-current-col">
          <col class="peer-status-col">
        </colgroup>
        <thead>
          <tr>
            <th>{{ t('operations.install.peerName') }}</th>
            <th>{{ t('operations.install.peerRange') }}</th>
            <th>{{ t('operations.install.peerCurrent') }}</th>
            <th>{{ t('operations.install.peerAvailability') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(peer, name) in data[version].peers" :key="name">
            <td class="text-left">{{ name }}</td>
            <td :data-label="t('operations.install.peerRange')">{{ peer.request }}</td>
            <td>
              <version-picker
                v-if="shouldShowPeerVersionSelect(peer, name)"
                :model-value="getVersion(name)"
                :versions="store.registry[name]"
                :current="store.dependencies?.[name]?.resolved"
                :latest="Object.keys(store.registry[name]).find(item => !item.includes('-'))"
                :placeholder="t('operations.install.select')"
                removable
                :mode-class="modeClass"
                @update:model-value="setVersion(name, $event)"
              ></version-picker>
              <span v-else class="peer-version" :class="{ workspace: !!getWorkspaceVersion(name), missing: !getPeerResolvedVersion(peer, name) }">
                {{ getPeerResolvedVersion(peer, name) || t('operations.confirm.notInstalled') }}
                <template v-if="getWorkspaceVersion(name)">{{ t('dependencyCard.current.workspace') }}</template>
              </span>
            </td>
            <td :class="['theme-color', peer.result]">
              <span class="inline-flex items-center gap-1">
                <k-icon :name="getResultIcon(peer.result)"></k-icon>
                {{ getResultText(peer, name) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </el-scrollbar>

    <template v-if="active && !global.static" #footer>
      <div class="left">
        <el-checkbox v-model="bulkMode">
          {{ t('operations.install.bulkMode') }}
          <k-hint>
            {{ t('operations.install.bulkModeHint') }}
          </k-hint>
        </el-checkbox>
      </div>
      <div class="right">
        <el-button v-if="local" type="primary" @click="configure()">{{ t('dependencyCard.actions.configure') }}</el-button>
        <template v-if="localSelection">
          <el-button v-if="showRemoveButton" @click="installDep('', true)" type="danger">{{ t('operations.install.remove') }}</el-button>
          <el-button v-else-if="workspace" @click="installDep(workspace)" type="success">{{ t('operations.install.add') }}</el-button>
        </template>
        <template v-else-if="data">
          <el-button v-if="showRemoveButton" @click="requestRemove()" type="danger">{{ t('operations.install.uninstall') }}</el-button>
          <!-- The color shows compatibility; a disabled button has nothing to report, so it stays neutral. -->
          <el-button :type="unchanged ? undefined : result" @click="installDep(version)" :disabled="unchanged">
            {{ current ? t('operations.install.update') : store.dependencies?.[active] ? t('operations.install.repair') : t('operations.install.install') }}
          </el-button>
        </template>
      </div>
    </template>
  </market-dialog>

  <market-dialog v-model="showRemoveDialog" class="market-remove-dialog" width="480px" destroy-on-close>
    {{ t('operations.install.removeConfigQuestion') }}
    <template #footer>
      <div class="left">
        <el-checkbox v-model="saveChoice">
          {{ t('operations.install.rememberChoice') }}
          <k-hint>
            {{ t('operations.install.rememberChoiceHint') }}
          </k-hint>
        </el-checkbox>
      </div>
      <div class="right">
        <el-button type="danger" @click="installDep('', false, true)">{{ t('operations.install.delete') }}</el-button>
        <el-button type="primary" @click="installDep('', false, false)">{{ t('operations.install.keep') }}</el-button>
      </div>
    </template>
  </market-dialog>

  <bundle-uninstall
    v-model="showBundleUninstallDialog"
    :package-name="bundleUninstallTarget"
    :record="bundleUninstallRecord"
  ></bundle-uninstall>
</template>

<script lang="ts" setup>

import { computed, ref, watch, reactive } from 'vue'
import { Dict, global, message, send, store, useContext, useConfig } from '@koishijs/client'
import { analyzeVersions, ensureInstalledConfig, findBundleRecord, getConfigWriter, getRegistryStatus, getRegistryStatusText, install, PeerInfo, ResultType } from './utils'
import { active, getBulkMode, getFrontendMode, getPendingOverrides, getRemoveConfig, getWritableBundleRecords, patchMarketNextConfig, patchMarketNextData } from '../utils'
import { parse } from 'semver'
import { isBundlePackageName } from '../../src/shared/bundle'
import { isLocalDependency } from '../../src/shared/dependency-source'
import BundleUninstall from './bundle-uninstall.vue'
import VersionPicker from './version-picker.vue'
import { useMarketNextI18n } from '../i18n'
import { getMarketObject } from '../market/state'
import MarketDialog from './market-dialog.vue'

const ctx = useContext()
const config = useConfig()
const { t } = useMarketNextI18n()
const frontendMode = computed(() => getFrontendMode(config.value))
const modeClass = computed(() => `market-mode-${frontendMode.value}`)

const saveChoice = ref(false)
const showRemoveDialog = ref(false)
const showBundleUninstallDialog = ref(false)
const bundleUninstallTarget = ref('')

const bulkMode = computed({
  get: () => getBulkMode(),
  set: (value: boolean) => {
    void patchMarketNextData({ bulkMode: value })
  },
})

function installDep(version: string, checkConfig = false, removeConfig = false) {
  const target = active.value
  if (!target) return

  // workspace packages don't need to be installed
  if (bulkMode.value && !workspace.value) {
    const override = getPendingOverrides()
    if (dep.value?.resolved === version || !version && !dep.value) {
      delete override[target]
    } else {
      override[target] = version
    }
    void patchMarketNextData({ override: { ...override } })
    active.value = ''
    return
  }

  // 1. The plugin is to be removed.
  // 2. The plugin has config entries.
  // 3. `removeConfig` is not set.
  if (checkConfig && getConfigWriter(ctx)?.get(target)?.length) {
    const savedRemoveConfig = getRemoveConfig(config.value)
    if (typeof savedRemoveConfig !== 'boolean') {
      showRemoveDialog.value = true
      return
    } else {
      removeConfig = savedRemoveConfig
    }
  }

  if (saveChoice.value) {
    if (config.value.market) config.value.market.removeConfig = removeConfig
    void patchMarketNextConfig({ removeConfig })
  }
  saveChoice.value = false
  showRemoveDialog.value = false

  versions[target] = version
  return install(versions, async () => {
    if (workspace.value) return
    if (version) {
      for (const key in versions) {
        await ensureInstalledConfig(ctx, key, key !== target)
      }
    } else if (removeConfig) {
      getConfigWriter(ctx)?.remove(target)
    }
    if (!version) {
      const records = getWritableBundleRecords(config.value)
      delete records[target]
      const saved = await patchMarketNextData({ bundleRecords: records })
      if (!saved) message.warning(t('operations.confirm.saveBundleFailed'))
    }
  })
}

const version = computed({
  get: () => versions[active.value],
  set: (value) => versions[active.value] = value,
})

const selectVersion = computed({
  get: () => version.value,
  set(value) {
    version.value = value
  },
})

const versions = reactive<Dict<string>>({})

function getOverride() {
  return bulkMode.value ? getPendingOverrides() : versions
}

function getVersion(name: string) {
  const override = getOverride()
  return override[name]
}

function setVersion(name: string, version: string) {
  const override = getOverride()
  if (version) {
    override[name] = version
  } else {
    delete override[name]
  }
}

function shouldShowPeerVersionSelect(peer: PeerInfo, name: string) {
  if (!store.registry?.[name] || isLocalPackageSelection(name)) return false
  if (name in getOverride()) return true
  return peer.result === 'danger'
}

function getPeerResolvedVersion(peer: PeerInfo, name: string) {
  return getVersion(name)
    || getWorkspaceVersion(name)
    || peer.resolved
    || store.dependencies?.[name]?.resolved
    || store.packages?.[name]?.package.version
}

const unchanged = computed(() => {
  return !data.value?.[version.value]
    || version.value === store.dependencies?.[active.value]?.request && !!store.dependencies?.[active.value]?.resolved
})

const dep = computed(() => store.dependencies?.[active.value])
const current = computed(() => store.dependencies?.[active.value]?.resolved)
const local = computed(() => store.packages?.[active.value])
const bundleUninstallRecord = computed(() => {
  const target = bundleUninstallTarget.value
  if (!target || !isBundlePackageName(target)) return
  return findBundleRecord(target)
})

const showRemoveButton = computed(() => {
  return current.value || store.dependencies?.[active.value] || bulkMode.value && getPendingOverrides()[active.value]
})

const workspace = computed(() => getWorkspaceVersion(active.value))
const localSelection = computed(() => isLocalPackageSelection(active.value))

function isLocalPackageSelection(name: string) {
  if (!name) return false
  const dependency = store.dependencies?.[name]
  return isLocalDependency(dependency)
    || !!getWorkspaceVersion(name)
    || !dependency && !!store.packages?.[name]
}

function requestRemove() {
  const target = active.value
  const record = target && findBundleRecord(target)
  if (target && record) {
    bundleUninstallTarget.value = target
    active.value = ''
    showBundleUninstallDialog.value = true
    return
  }
  installDep('', true)
}

function getWorkspaceVersion(name: string) {
  // workspace plugins:     dependencies ? packages √
  // workspace non-plugins: dependencies √ packages ×
  if (store.dependencies?.[name]?.workspace) {
    return store.dependencies?.[name]?.resolved
  }
  if (store.packages?.[name]?.workspace) {
    return store.packages?.[name]?.package.version
  }
}

const data = computed(() => {
  if (!active.value || localSelection.value) return
  return analyzeVersions(active.value, getVersion)
})

const registryStatus = computed(() => getRegistryStatus(active.value))

const registryStatusText = computed(() => getRegistryStatusText(active.value))

const danger = computed(() => {
  if (localSelection.value) return
  const deprecated = store.registry?.[active.value]?.[version.value]?.deprecated
  if (deprecated) return t('operations.install.deprecated', { reason: deprecated })
  if (getMarketObject(active.value)?.insecure) {
    return t('operations.install.insecure')
  }
})

const warning = computed(() => {
  if (!version.value || !current.value || localSelection.value) return
  try {
    const source = parse(current.value)
    const target = parse(version.value)
    if (source.major !== target.major || !source.major && source.minor !== target.minor) {
      return t('operations.install.majorWarning')
    }
  } catch {}
})

const result = computed(() => {
  if (!version.value || !data.value?.[version.value]) return
  const { result } = data.value[version.value]
  if (result === 'danger' || danger.value) return 'danger'
  if (result === 'warning' || warning.value) return 'warning'
  return result
})

function shouldFetchRegistry(name: string) {
  return !store.registry?.[name]
    && !isLocalPackageSelection(name)
    && !getRegistryStatus(name)?.loading
}

watch(() => data.value?.[version.value]?.peers, async (peers) => {
  if (!peers) return
  const names = Object.keys(peers).filter(shouldFetchRegistry)
  let registry: typeof store.registry = {}
  if (names.length) {
    try {
      registry = await send('market/registry', names)
    } catch (error) {
      console.error(error)
    }
  }
  Object.assign(registry, store.registry)
  if (bulkMode.value) return

  // rebuild versions
  for (const name of Object.keys(versions)) {
    if (name === active.value) continue
    if (name in peers) continue
    delete versions[name]
  }
  for (const name in peers) {
    if (!registry[name]) continue
    const { result } = peers[name]
    if (result !== 'warning' && result !== 'danger') continue
    versions[name] = Object.keys(registry[name])[0]
  }
})

watch(active, async (name) => {
  if (!name) return

  version.value = getPendingOverrides()[active.value]
    || store.dependencies?.[active.value]?.request
    || Object.keys(store.registry?.[name] || {})[0]

  if (shouldFetchRegistry(name)) {
    try {
      const registry = await send('market/registry', [name])
      const versions = registry?.[active.value] || store.registry?.[active.value]
      if (versions) version.value = Object.keys(versions)[0]
    } catch (error) {
      console.error(error)
    }
  }
}, { immediate: true })

function configure() {
  getConfigWriter(ctx)?.ensure(active.value)
  closePanel()
}

function closePanel() {
  active.value = ''
}

function getResultIcon(type: ResultType) {
  switch (type) {
    case 'primary': return 'info-full'
    case 'warning': return 'exclamation-full'
    case 'danger': return 'times-full'
    case 'success': return 'check-full'
  }
}

function getResultText(peer: PeerInfo, name: string) {
  const isOverriden = name in getOverride()
  const isInstalled = store.packages ? !!store.packages[name] : !!store.dependencies?.[name]
  switch (peer.result) {
    case 'primary': return isOverriden ? t('operations.install.waitingRemove') : t('operations.install.optional')
    case 'danger': return peer.resolved ? t('operations.install.incompatible') : isOverriden ? t('operations.install.waitingRemove') : t('operations.install.notDownloaded')
    case 'success': return isOverriden ? isInstalled ? t('operations.install.waitingUpdate') : t('operations.install.waitingInstall') : t('operations.install.downloaded')
  }
}

</script>

<style lang="scss">

.theme-color {
  @mixin apply-color($name) {
    &.#{$name} {
      color: var(--#{$name});
    }
  }

  @include apply-color(primary);
  @include apply-color(success);
  @include apply-color(warning);
  @include apply-color(danger);
}

.install-panel {
  .el-dialog__header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    padding-right: 36px;

    .el-dialog__title {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }

  .warning {
    color: var(--k-color-warning);
  }

  .danger {
    color: var(--k-color-danger);
  }

  .market-dialog-body > div {
    margin: 1rem 0;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid var(--k-color-border);
    border-radius: 8px;

    td, th {
      padding: 0.5rem 0.875rem;
      border-top: 1px solid var(--k-color-divider);
      text-align: left;
      white-space: nowrap;
    }

    // Long peer names wrap so the table never pushes the dialog sideways.
    td:first-child {
      white-space: normal;
      overflow-wrap: anywhere;
    }

    // The version picker is wider than plain versions, so this column is centered to line it up with its header.
    td:nth-child(3),
    th:nth-child(3) {
      text-align: center;
    }

    thead th {
      border-top: 0;
      color: var(--fg3);
      font-size: 0.8125rem;
      font-weight: normal;
    }
  }

  .peer-version {
    font-weight: 600;

    &.workspace {
      color: var(--k-color-success);
    }

    &.missing {
      color: var(--k-color-danger);
    }
  }

  .el-dialog__footer .left {
    margin-right: auto;
  }

  .el-dialog__footer .right {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;

    .el-button + .el-button {
      margin-left: 0;
    }
  }
}

.market-remove-dialog .el-dialog__footer {
  .left {
    margin-right: auto;
  }

  .right {
    display: flex;
    gap: 0.5rem;
  }

  .el-button + .el-button {
    margin-left: 0;
  }
}

@media (max-width: 768px) {
  // Each peer becomes a two-line block: name and availability, then range and current version.
  .install-panel .peer-table {
    display: block;

    colgroup,
    thead {
      display: none;
    }

    tbody {
      display: block;
    }

    tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.25rem 0.75rem;
      align-items: center;
      padding: 0.625rem 0.875rem;
      // Koishi's global table rules put borders on tr, which only show once it stops being a table row.
      border: 0;

      & + tr {
        border-top: 1px solid var(--k-color-divider);
      }
    }

    td {
      padding: 0;
      border-top: 0;
    }

    // The name leads the block, so it is a step larger than the status beside it.
    td:nth-child(1) {
      font-size: 0.9375rem;
      font-weight: 500;
    }

    td:nth-child(2) {
      color: var(--fg2);
      font-size: 0.875rem;

      &::before {
        content: attr(data-label) ' ';
        color: var(--fg3);
      }
    }

    td:nth-child(3) {
      grid-area: 2 / 2;
      justify-self: end;
    }

    td:nth-child(4) {
      grid-area: 1 / 2;
      justify-self: end;
    }
  }
}

</style>

<template>
  <el-dialog :model-value="!!active" @update:model-value="closePanel" :class="['install-panel', modeClass]" destroy-on-close>
    <template v-if="active" #header="{ titleId, titleClass }">
      <span :id="titleId" :class="titleClass">
        {{ active + (workspace ? ` (${t('dependencyCard.current.workspace')})` : '') }}
      </span>
      <el-select
        v-if="data"
        v-model="selectVersion"
        class="market-version-select"
        :disabled="!!workspace"
        :popper-class="versionPopperClass"
      >
        <el-option v-for="({ result }, version) in data" :key="version" :value="version">
          {{ version }}
          <template v-if="version === current">{{ t('dependencyCard.actions.current') }}</template>
          <span :class="[result, 'theme-color', 'dot-hint']"></span>
        </el-option>
      </el-select>
    </template>

    <k-comment class="danger" v-if="danger" type="danger">{{ danger }}</k-comment>
    <k-comment class="warning" v-if="warning" type="warning">{{ warning }}</k-comment>

    <div v-if="!data && active && !workspace">
      <k-comment :type="registryStatus?.error ? 'danger' : 'info'">{{ registryStatusText }}</k-comment>
    </div>

    <k-comment v-if="store.dependencies?.[active] && !current" type="danger">
      {{ t('operations.install.installErrorHint') }}
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
            <td>{{ peer.request }}</td>
            <td>
              <span class="wrapper" v-if="shouldShowPeerVersionSelect(peer, name)">
                <span class="shadow">{{ getVersion(name) || t('operations.install.select') }}</span>
                <el-select
                  class="frameless market-version-select"
                  :model-value="getVersion(name)"
                  :popper-class="versionPopperClass"
                  @update:model-value="setVersion(name, $event)"
                >
                    <el-option value="">{{ t('dependencyCard.actions.remove') }}</el-option>
                  <el-option v-for="(_, version) in store.registry[name]" :key="version" :value="version">
                    {{ version }}
                    <template v-if="version === current">{{ t('dependencyCard.actions.current') }}</template>
                    <!-- <span :class="[result, 'theme-color', 'dot-hint']"></span> -->
                  </el-option>
                </el-select>
              </span>
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
        <template v-if="workspace">
          <el-button v-if="showRemoveButton" @click="installDep('', true)" type="danger">{{ t('operations.install.remove') }}</el-button>
          <el-button v-else @click="installDep(workspace)" type="success">{{ t('operations.install.add') }}</el-button>
        </template>
        <template v-else-if="data">
          <el-button v-if="showRemoveButton" @click="requestRemove()" type="danger">{{ t('operations.install.uninstall') }}</el-button>
          <el-button :type="result" @click="installDep(version)" :disabled="unchanged">
            {{ current ? t('operations.install.update') : store.dependencies?.[active] ? t('operations.install.repair') : t('operations.install.install') }}
          </el-button>
        </template>
      </div>
    </template>
  </el-dialog>

  <el-dialog v-model="showRemoveDialog" class="market-remove-dialog" destroy-on-close>
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
  </el-dialog>

  <bundle-uninstall
    v-model="showBundleUninstallDialog"
    :package-name="bundleUninstallTarget"
    :record="bundleUninstallRecord"
  ></bundle-uninstall>
</template>

<script lang="ts" setup>

import { computed, ref, watch, reactive } from 'vue'
import { Dict, global, message, send, store, useContext, useConfig } from '@koishijs/client'
import { analyzeVersions, createLocalBundleRecord, ensureInstalledConfig, getConfigWriter, getRegistryStatus, getRegistryStatusText, install, PeerInfo, ResultType } from './utils'
import { active, getBulkMode, getBundleRecords, getFrontendMode, getPendingOverrides, getRemoveConfig, getWritableBundleRecords, patchMarketNextConfig, patchMarketNextData } from '../utils'
import { parse } from 'semver'
import { isBundlePackageName } from '../../src/shared/bundle'
import BundleUninstall from './bundle-uninstall.vue'
import { useMarketNextI18n } from '../i18n'
import { getMarketObject } from '../market/state'

const ctx = useContext()
const config = useConfig()
const { t } = useMarketNextI18n()
const frontendMode = computed(() => getFrontendMode(config.value))
const modeClass = computed(() => `market-mode-${frontendMode.value}`)
const versionPopperClass = computed(() => `market-version-popper ${modeClass.value}`)

const saveChoice = ref(false)
const showRemoveDialog = ref(false)
const showBundleUninstallDialog = ref(false)
const bundleUninstallTarget = ref('')

const bulkMode = computed({
  get: () => getBulkMode(config.value),
  set: (value: boolean) => {
    if (config.value.market) config.value.market.bulkMode = value
    void patchMarketNextConfig({ bulkMode: value })
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
  if (!store.registry?.[name] || getWorkspaceVersion(name)) return false
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
  return getBundleRecords(config.value)[target] || createLocalBundleRecord(target)
})

const showRemoveButton = computed(() => {
  return current.value || store.dependencies?.[active.value] || bulkMode.value && getPendingOverrides()[active.value]
})

const workspace = computed(() => getWorkspaceVersion(active.value))

function requestRemove() {
  const target = active.value
  const record = target && (getBundleRecords(config.value)[target] || createLocalBundleRecord(target))
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
  if (!active.value || workspace.value) return
  return analyzeVersions(active.value, getVersion)
})

const registryStatus = computed(() => getRegistryStatus(active.value))

const registryStatusText = computed(() => getRegistryStatusText(active.value))

const danger = computed(() => {
  if (workspace.value) return
  const deprecated = store.registry?.[active.value]?.[version.value]?.deprecated
  if (deprecated) return t('operations.install.deprecated', { reason: deprecated })
  if (getMarketObject(active.value)?.insecure) {
    return t('operations.install.insecure')
  }
})

const warning = computed(() => {
  if (!version.value || !current.value || workspace.value) return
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
  return !store.registry?.[name] && !getWorkspaceVersion(name) && !getRegistryStatus(name)?.loading
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

.install-panel.el-dialog,
.el-dialog.install-panel,
.install-panel .el-dialog {
  width: min(720px, calc(100vw - 32px)) !important;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--k-color-border) 88%, var(--fg1) 12%);
  border-radius: 10px;
  color: var(--fg1);
  background: var(--k-card-bg);
  box-shadow: none;
}

.install-panel {
  .el-dialog__header {
    display: flex;
    gap: 0 0.5em;
    align-items: center;
    min-height: 62px;
    padding: 14px 44px 12px 20px;
    border-bottom: 1px solid color-mix(in srgb, var(--k-color-border) 82%, transparent);
    background: color-mix(in srgb, var(--k-side-bg) 72%, var(--k-card-bg));

    .el-dialog__title {
      min-width: 0;
      overflow: hidden;
      color: var(--fg1);
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 700;
      margin-right: 0.5rem;
      flex: 0 0 auto;
    }

    .el-select {
      flex: 1 1 auto;
      max-width: 12.5rem;
      margin: -2px 0 -4px;
    }
  }

  .el-dialog__headerbtn {
    top: 11px;
    right: 12px;
    width: 38px;
    height: 38px;
    border-radius: 8px;
    color: var(--fg2);
    transition: background 0.15s, color 0.15s;

    &:hover {
      color: var(--k-color-primary);
      background: color-mix(in srgb, var(--k-color-primary) 12%, transparent);
    }
  }

  .warning {
    color: var(--k-color-warning);
  }

  .danger {
    color: var(--k-color-danger);
  }

  .version-badges {
    float: right;
    margin-right: -12px;
  }

  .el-dialog__body {
    padding: 16px 20px 6px;
    min-height: 40px;
    background: color-mix(in srgb, var(--k-side-bg) 58%, var(--k-card-bg));

    > div {
      margin: 1rem 0;
    }

    &:last-child {
      padding-bottom: 1rem;
    }
  }

  .peer-table-scroll {
    border-radius: 8px;
    background: var(--k-card-bg);
    box-shadow: none;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    overflow: hidden;
    margin: 0.75rem 0;

    .peer-name-col {
      width: 42%;
    }

    .peer-range-col {
      width: 18%;
    }

    .peer-current-col {
      width: 20%;
    }

    .peer-status-col {
      width: 20%;
    }

    thead, tbody {
      td, th {
        padding: 0.62rem 0.875rem;
        white-space: nowrap;
        overflow: hidden;
        color: var(--fg1);
        text-overflow: ellipsis;
        border-bottom: 1px solid var(--k-color-border);
        border-right: 1px solid var(--k-color-border);
        font-size: 0.82rem;

        &:last-child {
          border-right: none;
        }
      }
    }

    th {
      background: color-mix(in srgb, var(--fg1) 5%, var(--k-side-bg));
      color: var(--fg2);
      font-weight: 700;
      text-align: left;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tbody tr {
      background: var(--k-card-bg);
      transition: background 0.15s;

      &:hover {
        background: color-mix(in srgb, var(--k-color-primary) 6%, var(--k-card-bg));
      }
    }
  }

  .peer-version {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    min-height: 28px;
    overflow: hidden;
    padding: 0 9px;
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    color: var(--fg1);
    background: color-mix(in srgb, var(--k-side-bg) 42%, var(--k-card-bg));
    font-weight: 700;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.workspace {
      gap: 6px;
      color: var(--k-color-success);
      border-color: color-mix(in srgb, var(--k-color-success) 34%, var(--k-color-border));
      background: color-mix(in srgb, var(--k-color-success) 10%, var(--k-card-bg));
    }

    &.missing {
      color: var(--k-color-danger);
      border-color: color-mix(in srgb, var(--k-color-danger) 34%, var(--k-color-border));
      background: color-mix(in srgb, var(--k-color-danger) 10%, var(--k-card-bg));
    }
  }

  span.link {
    &:hover {
      cursor: pointer;
      text-decoration: underline;
    }
  }

  .el-button + .el-button {
    margin-left: 1rem;
  }

  .el-dialog__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 68px;
    padding: 14px 16px;
    border-top: 1px solid color-mix(in srgb, var(--k-color-border) 82%, transparent);
    background: color-mix(in srgb, var(--k-side-bg) 50%, var(--k-card-bg));
  }

  &.market-mode-polished {
    border-color: color-mix(in srgb, var(--k-color-primary) 18%, var(--k-color-border));
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--k-color-primary) 4%, transparent), transparent 44%),
      var(--k-card-bg);
    box-shadow:
      0 28px 80px rgb(0 0 0 / 32%),
      0 0 0 1px color-mix(in srgb, var(--fg1) 8%, transparent) inset;

    .el-dialog__header {
      border-bottom-color: color-mix(in srgb, var(--k-color-primary) 12%, var(--k-color-border));
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--k-color-primary) 8%, transparent), transparent 70%),
        color-mix(in srgb, var(--k-side-bg) 72%, var(--k-card-bg));
    }

    .peer-table-scroll {
      box-shadow: 0 12px 30px rgb(0 0 0 / 12%);
    }

    .el-dialog__footer {
      border-top-color: color-mix(in srgb, var(--k-color-primary) 12%, var(--k-color-border));
    }
  }

  .wrapper {
    position: relative;
    display: inline-flex;
    min-width: 7.8rem;
    max-width: 100%;

    .shadow {
      letter-spacing: 1px;
      visibility: hidden;
      padding-right: 22px; // .el-input__suffix
    }

    .el-select {
      position: absolute;
      left: 0;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
    }
  }

  .frameless {
    --el-fill-color-blank: var(--k-card-bg);
    --el-border-color: var(--k-color-border);
    --el-text-color-regular: var(--fg1);

    :deep(.el-input__wrapper) {
      min-height: 30px;
      border-radius: 8px;
      box-shadow: 0 0 0 1px var(--k-color-border) inset;
    }
  }
}

.dot-hint::before {
  content: '';
  position: absolute;
  border-radius: 100%;
  width: 0.5rem;
  height: 0.5rem;
  top: 50%;
  right: 20px;
  transform: translate(0, -50%);
  background-color: currentColor;
  transition: background-color 0.3s ease;
  box-shadow: 1px 1px 2px #3333;
}

</style>

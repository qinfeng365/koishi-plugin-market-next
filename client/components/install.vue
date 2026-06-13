<template>
  <el-dialog :model-value="!!active" @update:model-value="active = ''" class="install-panel" destroy-on-close>
    <template v-if="active" #header="{ titleId, titleClass }">
      <span :id="titleId" :class="titleClass">
        {{ active + (workspace ? ' (工作区)' : '') }}
      </span>
      <el-select v-if="data" :disabled="!!workspace" v-model="selectVersion">
        <el-option v-for="({ result }, version) in data" :key="version" :value="version">
          {{ version }}
          <template v-if="version === current">(当前)</template>
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
      该依赖的安装发生了错误，你可以尝试修复或移除它。
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
            <th>依赖名称</th>
            <th>版本区间</th>
            <th>当前版本</th>
            <th>可用性</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(peer, name) in data[version].peers" :key="name">
            <td class="text-left">{{ name }}</td>
            <td>{{ peer.request }}</td>
            <td>
              <span class="wrapper" v-if="shouldShowPeerVersionSelect(peer, name)">
                <span class="shadow">{{ getVersion(name) || 'Select' }}</span>
                <el-select
                  class="frameless"
                  :model-value="getVersion(name)"
                  @update:model-value="setVersion(name, $event)"
                >
                  <el-option value="">移除依赖</el-option>
                  <el-option v-for="(_, version) in store.registry[name]" :key="version" :value="version">
                    {{ version }}
                    <template v-if="version === current">(当前)</template>
                    <!-- <span :class="[result, 'theme-color', 'dot-hint']"></span> -->
                  </el-option>
                </el-select>
              </span>
              <span v-else class="peer-version" :class="{ workspace: !!getWorkspaceVersion(name), missing: !getPeerResolvedVersion(peer, name) }">
                {{ getPeerResolvedVersion(peer, name) || '未安装' }}
                <template v-if="getWorkspaceVersion(name)">工作区</template>
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
        <el-checkbox v-model="config.market.bulkMode">
          批量操作模式
          <k-hint>
            批量操作模式下，你可以同时安装、更新或移除多个插件。勾选此选项后，你的所有操作会被暂存，直到你点击右上角的“应用更改”按钮。
          </k-hint>
        </el-checkbox>
      </div>
      <div class="right">
        <el-button v-if="local" type="primary" @click="configure()">配置</el-button>
        <template v-if="workspace">
          <el-button v-if="showRemoveButton" @click="installDep('', true)" type="danger">移除</el-button>
          <el-button v-else @click="installDep(workspace)" type="success">添加</el-button>
        </template>
        <template v-else-if="data">
          <el-button v-if="showRemoveButton" @click="requestRemove()" type="danger">卸载</el-button>
          <el-button :type="result" @click="installDep(version)" :disabled="unchanged">
            {{ current ? '更新' : store.dependencies?.[active] ? '修复' : '安装' }}
          </el-button>
        </template>
      </div>
    </template>
  </el-dialog>

  <el-dialog v-model="showRemoveDialog" destroy-on-close>
    检测到你正在卸载一个已配置的插件，是否同时删除其配置？
    <template #footer>
      <div class="left">
        <el-checkbox v-model="saveChoice">
          记住我的选择
          <k-hint>
            未来将不再弹出此对话框。你仍然可以在用户设置中更改此行为。
          </k-hint>
        </el-checkbox>
      </div>
      <div class="right">
        <el-button type="danger" @click="installDep('', false, true)">删除</el-button>
        <el-button type="primary" @click="installDep('', false, false)">保留</el-button>
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
import { Dict, global, send, store, useContext, useConfig } from '@koishijs/client'
import { analyzeVersions, createLocalBundleRecord, ensureInstalledConfig, getRegistryStatus, getRegistryStatusText, install, PeerInfo, ResultType } from './utils'
import { active } from '../utils'
import { parse } from 'semver'
import { isBundlePackageName } from '../../src/shared/bundle'
import BundleUninstall from './bundle-uninstall.vue'

const ctx = useContext()
const config = useConfig()

const saveChoice = ref(false)
const showRemoveDialog = ref(false)
const showBundleUninstallDialog = ref(false)
const bundleUninstallTarget = ref('')

function installDep(version: string, checkConfig = false, removeConfig = false) {
  const target = active.value
  if (!target) return

  // workspace packages don't need to be installed
  if (config.value.market.bulkMode && !workspace.value) {
    if (dep.value?.resolved === version || !version && !dep.value) {
      delete config.value.market.override[target]
    } else {
      config.value.market.override[target] = version
    }
    active.value = ''
    return
  }

  // 1. The plugin is to be removed.
  // 2. The plugin has config entries.
  // 3. `removeConfig` is not set.
  if (checkConfig && ctx.configWriter?.get(target)?.length) {
    if (typeof config.value.market?.removeConfig !== 'boolean') {
      showRemoveDialog.value = true
      return
    } else {
      removeConfig = config.value.market.removeConfig
    }
  }

  if (saveChoice.value) {
    config.value.market = {
      ...config.value.market,
      removeConfig,
    }
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
      ctx.configWriter?.remove(target)
    }
    if (!version) {
      delete config.value.market.bundleRecords?.[target]
    }
  })
}

const version = computed({
  get: () => versions[active.value],
  set: (value) => versions[active.value] = value,
})

const selectVersion = computed({
  get() {
    if (store.dependencies?.[active.value]?.request === version.value) {
      return version.value + ' (当前)'
    } else {
      return version.value
    }
  },
  set(value) {
    version.value = value
  },
})

const versions = reactive<Dict<string>>({})

function getOverride() {
  return config.value.market.bulkMode ? config.value.market.override : versions
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
  return config.value.market?.bundleRecords?.[target] || createLocalBundleRecord(target)
})

const showRemoveButton = computed(() => {
  return current.value || store.dependencies?.[active.value] || config.value.market.bulkMode && config.value.market.override[active.value]
})

const workspace = computed(() => getWorkspaceVersion(active.value))

function requestRemove() {
  const target = active.value
  if (target && isBundlePackageName(target)) {
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
  if (deprecated) return '此版本已废弃：' + deprecated
  if (store.market?.data[active.value]?.insecure) {
    return '警告：从此插件的最新版本中检测出安全性问题。安装或升级此插件可能导致严重问题。'
  }
})

const warning = computed(() => {
  if (!version.value || !current.value || workspace.value) return
  try {
    const source = parse(current.value)
    const target = parse(version.value)
    if (source.major !== target.major || !source.major && source.minor !== target.minor) {
      return '提示：你正在更改依赖的主版本号。这可能导致不兼容的行为。'
    }
  } catch {}
})

const result = computed(() => {
  if (!version.value) return
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
  if (config.value.market.bulkMode) return

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

  version.value = config.value.market.override[active.value]
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
  ctx.configWriter?.ensure(active.value)
  active.value = null
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
    case 'primary': return isOverriden ? '等待移除' : '可选'
    case 'danger': return peer.resolved ? '不兼容' : isOverriden ? '等待移除' : '未下载'
    case 'success': return isOverriden ? isInstalled ? '等待更新' : '等待安装' : '已下载'
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
  border: 1px solid color-mix(in srgb, var(--k-color-primary) 18%, var(--k-color-border));
  border-radius: 10px;
  color: var(--fg1);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--k-color-primary) 4%, transparent), transparent 44%),
    var(--k-card-bg);
  box-shadow:
    0 28px 80px rgb(0 0 0 / 32%),
    0 0 0 1px color-mix(in srgb, var(--fg1) 8%, transparent) inset;
}

.install-panel {
  .el-dialog__header {
    display: flex;
    gap: 0 0.5em;
    align-items: center;
    min-height: 62px;
    padding: 14px 44px 12px 20px;
    border-bottom: 1px solid color-mix(in srgb, var(--k-color-primary) 12%, var(--k-color-border));
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--k-color-primary) 8%, transparent), transparent 70%),
      color-mix(in srgb, var(--k-side-bg) 72%, var(--k-card-bg));

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
    box-shadow: 0 12px 30px rgb(0 0 0 / 12%);
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
    border-top: 1px solid color-mix(in srgb, var(--k-color-primary) 12%, var(--k-color-border));
    background: color-mix(in srgb, var(--k-side-bg) 50%, var(--k-card-bg));
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

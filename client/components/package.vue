<template>
  <!-- List row mode -->
  <div v-if="props.listMode" :class="['dep-list-row', modeClass, statusClass]" :style="cardStyle">
    <div class="dep-status-mark" aria-hidden="true">
      <market-icon :name="markIcon"></market-icon>
    </div>
    <div class="col-name">
      <span class="name-display" :title="name">
        <span class="name-label">{{ displayName }}</span>
        <span v-if="bundlePackage" class="dep-list-kind-pill" title="插件包">
          <market-icon name="file-archive"></market-icon>
          插件包
        </span>
      </span>
      <span class="name-full" :title="name">{{ name }}</span>
    </div>
    <div class="col-version">{{ currentText }}</div>
    <div class="col-latest" :class="{ 'has-update': updatable, 'pending-val': pending }">
      {{ showTargetMeta ? targetText : '—' }}
    </div>
    <div class="col-actions" @click.stop>
      <el-button v-if="showQuickUpdate" size="small" type="primary" @click="selectedVersion = latestVersion">更新</el-button>
      <el-button v-if="showConfigure" size="small" type="primary" :loading="configuring" @click="configure">配置</el-button>
      <el-button v-if="showInlineIgnoreUpdate" size="small" @click="openIgnoreDialog">忽略</el-button>
      <el-button v-if="showRestoreUpdate" size="small" @click="restoreUpdate">恢复</el-button>
      <el-select
        v-if="showVersionControl && data && (editing || pending)"
        v-model="selectedVersion"
        size="small"
        class="dep-list-select"
        :class="{ pending }"
      >
        <el-option v-if="dep" :value="removeValue">移除依赖</el-option>
        <el-option v-for="({ result }, itemVersion) in data" :key="itemVersion" :value="itemVersion">
          {{ itemVersion }}
          <template v-if="itemVersion === dep?.resolved">(当前)</template>
          <span :class="[result, 'theme-color', 'dot-hint']"></span>
        </el-option>
      </el-select>
      <el-button v-if="pending" size="small" @click="clearOverride">撤销</el-button>
      <el-button v-if="showRemoveDependency" class="dep-remove-button" size="small" @click="removeDependency">{{ removeButtonText }}</el-button>
      <el-button v-if="canExpandCard && !pending" size="small" @click.stop="toggleEdit">
        {{ editToggleText }}
      </el-button>
    </div>
  </div>

  <!-- Card mode (default) -->
  <article
    v-else
    :class="['dep-package-card', modeClass, statusClass, { expandable: canExpandCard, expanded: editing }]"
    :style="cardStyle"
    @click="toggleCardActions"
  >
    <div class="dep-status-mark" aria-hidden="true">
      <market-icon :name="markIcon"></market-icon>
    </div>
    <div class="dep-card-header">
      <div class="dep-title">
        <div class="dep-title-line">
          <h3 :title="name">{{ displayName }}</h3>
          <span v-if="showIdentityPill" class="dep-kind-pill">
            <span class="dep-kind-icon">
              <market-icon :name="identityIcon"></market-icon>
            </span>
            {{ identityText }}
          </span>
          <span v-if="showStatusBadge" :class="['dep-badge', statusClass]">
            <market-icon :name="badgeIcon"></market-icon>
            {{ statusLabel }}
          </span>
        </div>
        <span class="dep-full-name" :title="name">{{ name }}</span>
      </div>
      <div class="dep-header-actions" @click.stop>
        <el-button
          v-if="showInlineIgnoreUpdate"
          size="small"
          @click="openIgnoreDialog"
        >
          忽略更新
        </el-button>
        <el-button v-if="showEditToggle" size="small" @click.stop="toggleEdit">
          {{ editToggleText }}
        </el-button>
      </div>
    </div>

    <p v-if="summaryText" class="dep-summary-text" :title="summaryText">
      {{ summaryText }}
    </p>

    <div class="dep-meta-row">
      <div class="dep-meta-item">
        <span>当前</span>
        <strong>{{ currentText }}</strong>
      </div>
      <div v-if="showTargetMeta" class="dep-meta-item">
        <span>{{ targetLabel }}</span>
        <strong :class="{ danger: pendingRemove }">{{ targetText }}</strong>
      </div>
      <div v-if="requestText" class="dep-meta-item">
        <span>范围</span>
        <strong>{{ requestText }}</strong>
      </div>
      <div v-if="showIdentityMeta" class="dep-meta-item dep-meta-kind">
        <span>类型</span>
        <strong>{{ identityText }}</strong>
      </div>
      <div v-if="showConfigMeta" class="dep-meta-item">
        <span>配置</span>
        <strong :class="{ warning: unconfigured }">{{ configText }}</strong>
      </div>
      <div v-if="showSourceMeta" class="dep-meta-item">
        <span>来源</span>
        <strong>{{ sourceText }}</strong>
      </div>
      <div v-if="versionSourceText" class="dep-meta-item">
        <span>版本源</span>
        <strong>{{ versionSourceText }}</strong>
      </div>
    </div>

    <p v-if="showDetailText" :class="['dep-status-text', { danger: statusClass === 'error' }]">
      {{ detailText }}
    </p>

    <div v-if="showCardActions" :class="['dep-card-actions', { floating: floatingActions }]" @click.stop>
      <el-select
        v-if="showVersionControl && data"
        v-model="selectedVersion"
        size="small"
        :class="{ pending }"
      >
        <el-option v-if="dep" :value="removeValue">移除依赖</el-option>
        <el-option v-for="({ result }, itemVersion) in data" :key="itemVersion" :value="itemVersion">
          {{ itemVersion }}
          <template v-if="itemVersion === dep?.resolved">(当前)</template>
          <span :class="[result, 'theme-color', 'dot-hint']"></span>
        </el-option>
      </el-select>
      <span v-else-if="showVersionControl" class="dep-muted">{{ compactStatusText }}</span>

      <div class="dep-card-buttons">
        <el-button
          v-if="showQuickUpdate"
          size="small"
          type="primary"
          @click="selectedVersion = latestVersion"
        >
          更新到最新
        </el-button>
        <el-button
          v-if="showRestoreUpdate"
          size="small"
          @click="restoreUpdate"
        >
          恢复提示
        </el-button>
        <el-button
          v-if="showConfigure"
          size="small"
          type="primary"
          :loading="configuring"
          @click="configure"
        >
          添加配置
        </el-button>
        <el-button
          v-if="showRemoveDependency"
          class="dep-remove-button"
          size="small"
          @click="removeDependency"
        >
          {{ removeButtonText }}
        </el-button>
        <el-button v-if="pending" size="small" @click="clearOverride">取消改动</el-button>
      </div>
    </div>
  </article>

  <el-dialog v-model="showIgnoreDialog" :class="['dep-ignore-dialog', modeClass]" append-to-body destroy-on-close>
    <template #header>忽略更新提示</template>
    <div class="dep-ignore-body">
      <p>
        将忽略 <strong>{{ displayName }}</strong>
        <template v-if="latestVersion"> 的 {{ latestVersion }} 更新提示。</template>
      </p>
      <el-checkbox v-model="ignorePackagePermanently">
        永久不检测这个插件的更新
      </el-checkbox>
      <template v-if="!ignorePackagePermanently">
        <label class="dep-ignore-field">
          <span>忽略多久</span>
          <el-radio-group v-model="ignoreDurationPreset">
            <el-radio-button value="forever">不限时</el-radio-button>
            <el-radio-button value="1d">1 天</el-radio-button>
            <el-radio-button value="7d">7 天</el-radio-button>
            <el-radio-button value="30d">30 天</el-radio-button>
            <el-radio-button value="custom">自定义</el-radio-button>
          </el-radio-group>
        </label>
        <label v-if="ignoreDurationPreset === 'custom'" class="dep-ignore-field inline">
          <span>自定义天数</span>
          <el-input-number v-model="ignoreCustomDays" :min="1" :max="3650" :step="1" controls-position="right"></el-input-number>
        </label>
        <label class="dep-ignore-field inline">
          <span>连续忽略版本数</span>
          <el-input-number v-model="ignoreCount" :min="1" :max="20" :step="1" controls-position="right"></el-input-number>
        </label>
      </template>
      <p class="dep-ignore-note">
        <template v-if="ignorePackagePermanently">
          永久不检测会记录在依赖管理的忽略规则中，可在“不检测更新”分组中恢复。
        </template>
        <template v-else>
          不限时表示不按时间过期；达到连续忽略版本数后，后续新版本会重新提示。
        </template>
      </p>
    </div>
    <template #footer>
      <el-button @click="showIgnoreDialog = false">取消</el-button>
      <el-button type="primary" :loading="ignoreSaving" @click="confirmIgnoreUpdate">确认忽略</el-button>
    </template>
  </el-dialog>

  <bundle-uninstall
    v-model="showBundleUninstallDialog"
    :package-name="name"
    :record="bundleRecord"
  ></bundle-uninstall>
</template>

<script lang="ts" setup>

import { computed, ref } from 'vue'
import { message, store, useConfig, useContext } from '@koishijs/client'
import type { SearchObject } from '@koishijs/registry'
import { isBundlePackageName, type PluginBundleRecord } from '../../src/shared/bundle'
import { createUpdateIgnoreRule, getBundleRecords, getFrontendMode, getIgnoredUpdateVersion, getLatestVersion, getMarketNextPolicy, getPendingOverrides, getWritableMarketNextPolicy, getUpdateIgnoreText, hasUpdate, isUpdateCheckDisabled, isUpdateIgnored, patchMarketNextConfig, patchMarketNextData } from '../utils'
import { activeBundle, analyzeVersions, createLocalBundleRecord, ensureInstalledConfig, expandedDependency, getRegistryStatus, getRegistryStatusText, pendingBundleUninstalls } from './utils'
import { resolveCategory } from '../market/utils'
import MarketIcon from '../market/icons'
import BundleUninstall from './bundle-uninstall.vue'

type ItemKind = 'pending' | 'bundle' | 'unconfigured' | 'updatable' | 'ignored' | 'check-disabled' | 'invalid' | 'error' | 'workspace' | 'manual' | 'installed'

const props = defineProps<{
  name: string
  kind?: ItemKind
  listMode?: boolean
}>()

const removeValue = '__market_next_remove__'
const day = 24 * 60 * 60 * 1000
const config = useConfig()
const ctx = useContext()
const frontendMode = computed(() => getFrontendMode(config.value))
const modeClass = computed(() => `market-mode-${frontendMode.value}`)
const configuring = ref(false)
const editing = computed({
  get: () => expandedDependency.value === props.name,
  set: (value: boolean) => expandedDependency.value = value ? props.name : '',
})
const showIgnoreDialog = ref(false)
const showBundleUninstallDialog = ref(false)
const ignoreDurationPreset = ref<'forever' | '1d' | '7d' | '30d' | 'custom'>('forever')
const ignoreCustomDays = ref(7)
const ignoreCount = ref(1)
const ignorePackagePermanently = ref(false)
const ignoreSaving = ref(false)

const dep = computed(() => store.dependencies?.[props.name])
const local = computed(() => store.packages?.[props.name])
const marketData = computed(() => store.market?.data?.[props.name])
const bundleRecord = computed(() => getBundleRecords(config.value)[props.name] || createLocalBundleRecord(props.name))
const bundleOrigin = computed(() => findBundleOrigin(props.name))

const displayName = computed(() => formatPackageDisplayName(props.name))

const data = computed(() => {
  if (dep.value?.workspace || dep.value?.invalid) return
  return analyzeVersions(props.name, (name) => getPendingOverrides()[name])
})

function getUpdatePolicy() {
  return getMarketNextPolicy(config.value)
}

function getUpdateIgnored() {
  const policy = getWritableMarketNextPolicy(config.value)
  policy.updateIgnored ||= {}
  return policy.updateIgnored
}

const status = computed(() => getRegistryStatus(props.name))

const latestVersion = computed(() => {
  const latest = getLatestVersion(props.name, getUpdatePolicy())
  if (latest) return latest
  const ignored = getIgnoredUpdateVersion(props.name, getUpdatePolicy())
  if (ignored) return ignored
  return dep.value?.latest ?? local.value?.package.version
})

const overrideValue = computed(() => {
  const override = getPendingOverrides()
  if (!Object.prototype.hasOwnProperty.call(override, props.name)) return
  return override[props.name]
})

const pending = computed(() => overrideValue.value !== undefined)
const pendingRemove = computed(() => pending.value && !overrideValue.value)
const updateCheckDisabled = computed(() => isUpdateCheckDisabled(props.name, getUpdatePolicy()))
const ignoredUpdate = computed(() => updateCheckDisabled.value || isUpdateIgnored(props.name, getUpdatePolicy()))
const updatable = computed(() => !!hasUpdate(props.name, getUpdatePolicy()))
const bundlePackage = computed(() => !!bundleRecord.value)
const unconfigured = computed(() => {
  if (bundlePackage.value) return false
  return !!ctx.configWriter && !!local.value && isPluginPackage(props.name) && !ctx.configWriter.get(props.name)?.length
})

const selectedVersion = computed({
  get() {
    if (pendingRemove.value) return removeValue
    if (overrideValue.value) return overrideValue.value
    return dep.value?.resolved ?? latestVersion.value ?? ''
  },
  set(value: string) {
    if (value === removeValue) {
      getPendingOverrides()[props.name] = ''
    } else if (value === dep.value?.resolved || !value && !dep.value) {
      delete getPendingOverrides()[props.name]
    } else {
      getPendingOverrides()[props.name] = value
    }
    void patchMarketNextData({ override: { ...getPendingOverrides() } })
  },
})

const statusClass = computed<ItemKind>(() => {
  if (pending.value) return 'pending'
  if (dep.value?.workspace) return 'workspace'
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
  if (pendingRemove.value) return '待卸载'
  if (pending.value && dep.value) return '待应用'
  if (pending.value) return '待安装'
  if (dep.value?.workspace) return '工作区'
  if (dep.value?.invalid) return '不支持'
  if (bundlePackage.value && (dep.value || local.value)) return '插件包'
  if (unconfigured.value) return '未配置'
  if (status.value?.error) return '版本异常'
  if (!dep.value && !local.value) return '手动添加'
  if (updateCheckDisabled.value) return '不检测'
  if (ignoredUpdate.value) return '已忽略'
  if (updatable.value) return '可更新'
  return '已安装'
})

const statusIcon = computed(() => {
  if (pendingRemove.value) return 'close'
  if (pending.value) return 'tag'
  if (bundlePackage.value && (dep.value || local.value)) return 'file-archive'
  if (unconfigured.value) return 'preview'
  if (dep.value?.invalid) return 'insecure'
  if (status.value?.error) return 'insecure'
  if (dep.value?.workspace) return 'file-archive'
  if (!dep.value) return 'search'
  if (updateCheckDisabled.value) return 'installed'
  if (ignoredUpdate.value) return 'installed'
  if (updatable.value) return 'asc'
  return 'installed'
})

const badgeIcon = computed(() => statusIcon.value)

const markIcon = computed(() => {
  if (statusClass.value === 'installed') return identityIcon.value
  return statusIcon.value
})

const currentText = computed(() => {
  if (!dep.value) return local.value?.package.version ?? '未安装'
  if (dep.value.workspace) return dep.value.resolved ? `${dep.value.resolved} / 工作区` : '工作区'
  return dep.value.resolved ?? '安装异常'
})

const targetText = computed(() => {
  if (pendingRemove.value) return '移除依赖'
  if (overrideValue.value) return overrideValue.value
  if (updatable.value && latestVersion.value) return latestVersion.value
  if (ignoredUpdate.value && latestVersion.value) return latestVersion.value
  if (dep.value?.workspace) return '保持工作区'
  if (statusClass.value === 'installed' && dep.value && !dep.value.workspace) {
    if (dep.value.latest) return dep.value.latest
    if (status.value?.loading) return '获取中'
  }
  if (latestVersion.value) return latestVersion.value
  return dep.value || local.value ? '等待版本数据' : '等待安装'
})

const targetLabel = computed(() => {
  if (pending.value) return '待应用'
  if (updatable.value) return '最新'
  if (ignoredUpdate.value) return '已忽略'
  if (dep.value || local.value) return '最新'
  return '目标'
})

const detailText = computed(() => {
  if (pendingRemove.value) return '此依赖将在应用更改后从 package.json 中移除。'
  if (pending.value && dep.value) return '此依赖已有暂存的版本变更，应用后生效。'
  if (pending.value) return '此依赖已加入待安装列表，应用后会安装到本地。'
  if (dep.value?.workspace) return '本地工作区依赖，不参与 npm registry 版本更新。'
  if (dep.value?.invalid) return '版本区间语法暂不支持自动版本管理，请手动修改 package.json。'
  if (bundlePackage.value && (dep.value || local.value)) return '插件包本身不需要配置；成员配置由插件包分组管理。'
  if (unconfigured.value) return '本地已下载，但插件配置页还没有对应配置项。'
  if (status.value?.error) return getRegistryStatusText(props.name)
  if (!data.value && !dep.value?.workspace) return getRegistryStatusText(props.name)
  if (updateCheckDisabled.value) return '已加入不检测更新名单；可点击“恢复提示”重新参与版本检测。'
  if (ignoredUpdate.value) return getUpdateIgnoreText(props.name, getUpdatePolicy()) || '已忽略当前更新。'
  if (updatable.value && latestVersion.value) return `发现新版本 ${latestVersion.value}。`
  return ''
})

const compactStatusText = computed(() => {
  if (dep.value?.workspace) return '工作区依赖'
  if (dep.value?.invalid) return '暂不支持'
  return status.value?.loading || !status.value ? '正在获取版本数据' : '暂无版本数据'
})

const configText = computed(() => {
  if (bundlePackage.value) return '不需要配置'
  if (!isPluginPackage(props.name)) return '非插件'
  if (!ctx.configWriter) return '未知'
  if (!local.value) return pending.value ? '待安装' : '未加载'
  return unconfigured.value ? '未配置' : '已配置'
})

const sourceText = computed(() => {
  if (bundleOrigin.value) return `插件包：${bundleOrigin.value.label || formatPackageDisplayName(bundleOrigin.value.package)}`
  if (bundleRecord.value) return '插件包自身'
  if (dep.value?.workspace || local.value?.workspace) return '工作区'
  if (pending.value && !dep.value) return '待安装'
  if (!dep.value && local.value) return '本地'
  if (!dep.value) return '手动'
  return 'package.json'
})

const removeButtonText = computed(() => bundleRecord.value ? '卸载插件包' : '卸载')

const requestText = computed(() => {
  if (!dep.value?.request) return ''
  if (dep.value.request === dep.value.resolved) return ''
  return dep.value.request
})

const versionSourceText = computed(() => {
  if (statusClass.value === 'installed' && !editing.value) return ''
  if (dep.value?.workspace) return ''
  if (status.value?.endpoint) return formatEndpoint(status.value.endpoint)
  if (status.value?.loading) return '获取中'
  if (!data.value && dep.value) return '等待'
  return ''
})

const identity = computed(() => resolveIdentity(props.name))

const identityText = computed(() => identity.value.label)
const identityIcon = computed(() => identity.value.icon)

const cardStyle = computed(() => {
  if (statusClass.value !== 'installed') return {}
  return {
    '--dep-accent': identity.value.color,
  }
})

const showIdentityPill = computed(() => statusClass.value === 'installed')

const showIdentityMeta = computed(() => statusClass.value !== 'installed')

const showStatusBadge = computed(() => statusClass.value !== 'installed')

const showConfigMeta = computed(() => statusClass.value !== 'installed' || configText.value !== '已配置')

const showSourceMeta = computed(() => statusClass.value !== 'installed' || sourceText.value !== 'package.json')

const summaryText = computed(() => {
  if (statusClass.value !== 'installed') return ''
  return pickDescription(marketData.value?.manifest?.description)
    || pickDescription(marketData.value?.package?.description)
    || pickDescription(local.value?.package?.description)
})

const showTargetMeta = computed(() => {
  if (pending.value || updatable.value || ignoredUpdate.value) return true
  if (statusClass.value === 'manual' || statusClass.value === 'error') return true
  return !!(dep.value || local.value) && !dep.value?.workspace && !local.value?.workspace
})

const showDetailText = computed(() => {
  return !!detailText.value && statusClass.value !== 'installed'
})

const showVersionControl = computed(() => {
  if (!data.value && !status.value?.error) return false
  return editing.value || pending.value || updatable.value || statusClass.value === 'error' || statusClass.value === 'manual'
})

const editToggleText = computed(() => {
  if (bundlePackage.value) return '管理'
  if (editing.value) return '收起'
  return data.value ? (props.listMode ? '版本' : '修改') : '操作'
})

const showEditToggle = computed(() => {
  if (bundlePackage.value && (dep.value || local.value)) return !pending.value
  return canExpandCard.value && !updatable.value
})

const canExpandCard = computed(() => {
  if (bundlePackage.value && (dep.value || local.value)) return !pending.value
  if (pending.value || statusClass.value === 'error' || statusClass.value === 'manual') return false
  if (data.value) return true
  return !!dep.value && !dep.value.workspace && !dep.value.invalid
})

const showQuickUpdate = computed(() => {
  return !pending.value && !unconfigured.value && updatable.value && !!latestVersion.value && !dep.value?.workspace
})

const showInlineIgnoreUpdate = computed(() => {
  return showQuickUpdate.value
})

const showRestoreUpdate = computed(() => {
  return !pending.value && ignoredUpdate.value
})

const showConfigure = computed(() => {
  return !pending.value && unconfigured.value
})

const showRemoveDependency = computed(() => {
  return (props.listMode || editing.value || statusClass.value !== 'installed')
    && !pending.value
    && !!dep.value
    && !dep.value.workspace
    && !dep.value.invalid
})

const showCardActions = computed(() => {
  return showVersionControl.value || showQuickUpdate.value || showRestoreUpdate.value || showConfigure.value || showRemoveDependency.value || pending.value
})

const floatingActions = computed(() => {
  return editing.value && statusClass.value === 'installed'
})

function toggleCardActions() {
  if (!canExpandCard.value) return
  if (bundlePackage.value) {
    openBundlePanel()
    return
  }
  editing.value = !editing.value
}

function toggleEdit() {
  if (bundlePackage.value) {
    openBundlePanel()
    return
  }
  editing.value = !editing.value
}

function openBundlePanel() {
  const data = marketData.value
  if (data) {
    activeBundle.value = data
    return
  }
  activeBundle.value = {
    package: {
      name: props.name,
      version: dep.value?.resolved ?? local.value?.package.version ?? latestVersion.value ?? '',
      keywords: [],
    },
    shortname: displayName.value,
  } as SearchObject
}

function clearOverride() {
  const pendingBundle = pendingBundleUninstalls.value[props.name]
  const override = getPendingOverrides()
  delete override[props.name]
  for (const member of pendingBundle?.members ?? []) {
    delete override[member]
  }
  void patchMarketNextData({ override: { ...override } })
  delete pendingBundleUninstalls.value[props.name]
}

function removeDependency() {
  if (bundleRecord.value) {
    showBundleUninstallDialog.value = true
    return
  }
  selectedVersion.value = removeValue
}

function openIgnoreDialog() {
  const duration = Math.max(0, getUpdatePolicy().updateIgnoreDuration ?? 0)
  const days = Math.max(1, Math.ceil(duration / day))
  ignoreDurationPreset.value = duration ? getDurationPreset(duration) : 'forever'
  ignoreCustomDays.value = days
  ignoreCount.value = normalizeDialogCount(getUpdatePolicy().updateIgnoreVersions)
  ignorePackagePermanently.value = false
  showIgnoreDialog.value = true
}

async function confirmIgnoreUpdate() {
  if (ignoreSaving.value) return
  ignoreSaving.value = true
  if (ignorePackagePermanently.value) {
    addPackageToIgnoredList(props.name)
    delete getUpdateIgnored()[props.name]
    const saved = await persistUpdatePolicy()
    ignoreSaving.value = false
    if (!saved) {
      message.error('保存忽略设置失败。')
      return
    }
    showIgnoreDialog.value = false
    message.success('已加入不检测更新名单。')
    return
  }
  const rule = createUpdateIgnoreRule(props.name, getUpdatePolicy(), {
    duration: getDialogDuration(),
    count: ignoreCount.value,
  })
  if (!rule) {
    ignoreSaving.value = false
    return
  }
  getUpdateIgnored()[props.name] = rule
  const saved = await persistUpdatePolicy()
  ignoreSaving.value = false
  if (!saved) {
    message.error('保存忽略设置失败。')
    return
  }
  showIgnoreDialog.value = false
  message.success('已忽略更新提示。')
}

function getDurationPreset(duration: number) {
  if (duration === day) return '1d'
  if (duration === 7 * day) return '7d'
  if (duration === 30 * day) return '30d'
  return 'custom'
}

function getDialogDuration() {
  switch (ignoreDurationPreset.value) {
    case '1d': return day
    case '7d': return 7 * day
    case '30d': return 30 * day
    case 'custom': return normalizeDialogCount(ignoreCustomDays.value, 3650) * day
    default: return 0
  }
}

function normalizeDialogCount(value?: number, max = 20) {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(max, Math.floor(value)))
}

function addPackageToIgnoredList(name: string) {
  const policy = getWritableMarketNextPolicy(config.value)
  const names = (policy.updateIgnoredPackages ?? '')
    .split(/[\s,，;；]+/g)
    .map(item => item.trim())
    .filter(Boolean)
  if (!names.some(item => item.toLowerCase() === name.toLowerCase())) {
    names.push(name)
  }
  policy.updateIgnoredPackages = names.join('\n')
}

async function restoreUpdate() {
  delete getUpdateIgnored()[props.name]
  removePackageFromIgnoredList(props.name)
  const saved = await persistUpdatePolicy()
  if (!saved) message.error('保存忽略设置失败。')
}

async function persistUpdatePolicy() {
  const policy = getUpdatePolicy()
  const configSaved = await patchMarketNextConfig({
    updateIgnoredPackages: policy.updateIgnoredPackages,
    updateIgnoreDuration: policy.updateIgnoreDuration,
    updateIgnoreVersions: policy.updateIgnoreVersions,
    updateIgnorePrerelease: policy.updateIgnorePrerelease,
  })
  const dataSaved = await patchMarketNextData({
    updateIgnored: policy.updateIgnored,
  })
  return configSaved && dataSaved
}

function findBundleOrigin(name: string): PluginBundleRecord | undefined {
  const records = getBundleRecords(config.value)
  return Object.values(records).find(record => {
    return record?.members?.some(member => member.package === name)
  })
}

function removePackageFromIgnoredList(name: string) {
  const policy = getWritableMarketNextPolicy(config.value)
  const names = (policy.updateIgnoredPackages ?? '')
    .split(/[\s,，;；]+/g)
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => item.toLowerCase() !== name.toLowerCase())
  policy.updateIgnoredPackages = names.join('\n')
}

function isPluginPackage(name: string) {
  return /^@koishijs\/plugin-[0-9a-z-]+$/.test(name) || /(^|\/)koishi-plugin-[0-9a-z-]+$/.test(name)
}

function formatPackageDisplayName(name: string) {
  const shortname = store.market?.data?.[name]?.shortname
  if (shortname && shortname !== name) return shortname
  if (name.startsWith('@koishijs/plugin-')) return name.slice('@koishijs/plugin-'.length)
  if (name.startsWith('koishi-plugin-')) return name.slice('koishi-plugin-'.length)
  const scoped = name.match(/^@([^/]+)\/koishi-plugin-(.+)$/)
  if (scoped) return `@${scoped[1]}/${scoped[2]}`
  return name
}

function pickDescription(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return ''
  const object = value as Record<string, unknown>
  for (const key of ['zh-CN', 'zh', 'en-US', 'en']) {
    const text = object[key]
    if (typeof text === 'string' && text.trim()) return text.trim()
  }
  const fallback = Object.values(object).find(item => typeof item === 'string' && item.trim())
  return typeof fallback === 'string' ? fallback.trim() : ''
}

function resolveIdentity(name: string) {
  if (isBundlePackageName(name)) return identityMap.bundle
  const data = store.market?.data?.[name]
  const category = resolveCategory(data?.category)
  const normalized = name.toLowerCase()
  if (/adapter[-/]/.test(normalized) || normalized.includes('adapter-')) return identityMap.adapter
  if (/database|sqlite|mysql|mongo|postgres|redis/.test(normalized)) return identityMap.database
  if (/console|config|insight|market|status|telemetry/.test(normalized)) return identityMap.webui
  if (/loader|server|koishi$|core|sandbox/.test(normalized)) return identityMap.core
  if (/command|schedule|cron|help|echo|logger|locales/.test(normalized)) return identityMap.general
  if (/chatluna|openai|ai|llm|gpt|claude|gemini/.test(normalized)) return identityMap.ai
  if (/image|canvas|puppeteer|screenshot/.test(normalized)) return identityMap.image
  if (/rss|media|music|video|bilibili|news/.test(normalized)) return identityMap.media
  if (/game|chess|mahjong/.test(normalized)) return identityMap.game
  return identityMap[category] ?? identityMap.other
}

const identityMap: Record<string, { label: string, icon: string, color: string }> = {
  adapter: { label: '适配器', icon: 'solid:adapter', color: '#4d8df7' },
  database: { label: '数据库', icon: 'solid:tool', color: '#21a67a' },
  webui: { label: '控制台', icon: 'solid:webui', color: '#8b6cf6' },
  core: { label: '核心', icon: 'solid:core', color: '#d89b32' },
  general: { label: '通用', icon: 'solid:general', color: '#6b8cff' },
  extension: { label: '扩展', icon: 'solid:extension', color: '#5c9ded' },
  manage: { label: '管理', icon: 'solid:manage', color: '#26a0a7' },
  preset: { label: '预设', icon: 'solid:preset', color: '#9b74df' },
  image: { label: '图片', icon: 'solid:image', color: '#d66aa8' },
  media: { label: '资讯', icon: 'solid:media', color: '#3e9fbb' },
  tool: { label: '工具', icon: 'solid:tool', color: '#54966f' },
  life: { label: '生活', icon: 'solid:life', color: '#8da44b' },
  ai: { label: 'AI', icon: 'solid:ai', color: '#b66be8' },
  meme: { label: '趣味', icon: 'solid:meme', color: '#d98445' },
  game: { label: '游戏', icon: 'solid:game', color: '#df6b5f' },
  gametool: { label: '游戏辅助', icon: 'solid:gametool', color: '#c77745' },
  bundle: { label: '插件包', icon: 'file-archive', color: '#9b74df' },
  other: { label: '插件', icon: 'solid:other', color: '#778294' },
}

function formatEndpoint(endpoint: string) {
  try {
    return new URL(endpoint).host
  } catch {
    return endpoint
  }
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

<style lang="scss">

.el-dialog.dep-ignore-dialog,
.dep-ignore-dialog.el-dialog,
.dep-ignore-dialog .el-dialog {
  width: min(560px, calc(100vw - 32px)) !important;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--k-color-border, #dcdfe6) 88%, var(--fg1, currentColor) 12%);
  border-radius: 10px;
  color: var(--fg1, var(--el-text-color-primary));
  background: color-mix(in srgb, var(--k-card-bg, var(--el-bg-color)) 88%, var(--k-side-bg, var(--el-bg-color)));
  box-shadow: none;
}

.dep-ignore-dialog {
  .el-dialog__header {
    display: flex;
    align-items: center;
    min-height: 52px;
    margin: 0;
    padding: 13px 44px 12px 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--k-color-border, #dcdfe6) 82%, transparent);
    background: color-mix(in srgb, var(--k-side-bg, var(--el-bg-color)) 70%, var(--k-card-bg, var(--el-bg-color)));

    .el-dialog__title {
      color: var(--fg1, var(--el-text-color-primary));
      font-weight: 700;
    }
  }

  .el-dialog__headerbtn {
    top: 8px;
    right: 10px;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    color: var(--fg2, var(--el-text-color-regular));

    &:hover {
      color: var(--k-color-primary, var(--el-color-primary));
      background: color-mix(in srgb, var(--k-color-primary, var(--el-color-primary)) 12%, transparent);
    }
  }

  .el-dialog__body {
    padding: 16px 18px 10px;
    background: color-mix(in srgb, var(--k-side-bg, var(--el-bg-color)) 46%, var(--k-card-bg, var(--el-bg-color)));
  }

  .el-dialog__footer {
    padding: 10px 18px 14px;
    border-top: 1px solid color-mix(in srgb, var(--k-color-border, #dcdfe6) 70%, transparent);
    background: color-mix(in srgb, var(--k-card-bg, var(--el-bg-color)) 84%, var(--k-side-bg, var(--el-bg-color)));
  }

  .dep-ignore-body {
    display: grid;
    gap: 0.85rem;

    p {
      margin: 0;
      color: var(--fg2, var(--el-text-color-regular));
      line-height: 1.5;
    }

    strong {
      color: var(--fg1, var(--el-text-color-primary));
    }
  }

  .dep-ignore-field {
    display: grid;
    gap: 0.38rem;
    min-width: 0;

    > span {
      color: var(--fg2, var(--el-text-color-regular));
      font-size: 0.86rem;
    }

    &.inline {
      grid-template-columns: 8rem minmax(0, 1fr);
      align-items: center;
    }
  }

  .dep-ignore-note {
    border: 1px solid color-mix(in srgb, var(--k-color-border, #dcdfe6) 70%, transparent);
    border-radius: 7px;
    padding: 0.52rem 0.62rem;
    color: var(--fg2, var(--el-text-color-regular));
    background: color-mix(in srgb, var(--k-side-bg, var(--el-bg-color)) 84%, var(--k-card-bg, var(--el-bg-color)));
    font-size: 0.82rem;
  }

  .el-radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.36rem;
  }

  .el-radio-button__inner {
    border-radius: 7px !important;
    border: 1px solid color-mix(in srgb, var(--k-color-border, #dcdfe6) 82%, transparent) !important;
    background: color-mix(in srgb, var(--k-card-bg, var(--el-bg-color)) 86%, var(--k-side-bg, var(--el-bg-color)));
    color: var(--fg2, var(--el-text-color-regular));
    box-shadow: none !important;
  }

  .el-radio-button__original-radio:checked + .el-radio-button__inner {
    border-color: color-mix(in srgb, var(--k-color-primary, var(--el-color-primary)) 58%, var(--k-color-border, #dcdfe6)) !important;
    background: color-mix(in srgb, var(--k-color-primary, var(--el-color-primary)) 15%, var(--k-card-bg, var(--el-bg-color)));
    color: var(--k-color-primary, var(--el-color-primary));
  }

  &.market-mode-polished {
    border-color: color-mix(in srgb, var(--k-color-primary) 14%, var(--k-color-border, #dcdfe6));
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--k-color-primary) 5%, transparent), transparent 46%),
      color-mix(in srgb, var(--k-card-bg, var(--el-bg-color)) 88%, var(--k-side-bg, var(--el-bg-color)));
    box-shadow:
      0 24px 68px rgb(0 0 0 / 32%),
      0 0 0 1px color-mix(in srgb, var(--fg1, currentColor) 7%, transparent) inset;

    .el-dialog__header {
      border-bottom-color: color-mix(in srgb, var(--k-color-primary) 10%, var(--k-color-border, #dcdfe6));
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--k-color-primary) 8%, transparent), transparent 70%),
        color-mix(in srgb, var(--k-side-bg, var(--el-bg-color)) 70%, var(--k-card-bg, var(--el-bg-color)));
    }

    .dep-ignore-note {
      background: color-mix(in srgb, var(--k-color-primary, var(--el-color-primary)) 5%, var(--k-side-bg, var(--el-bg-color)));
    }
  }
}

@media (max-width: 560px) {
  .dep-ignore-dialog {
    .el-dialog__body {
      padding: 14px;
    }

    .dep-ignore-field.inline {
      grid-template-columns: 1fr;
    }
  }
}

</style>

<style lang="scss" scoped>

.dep-package-card {
  --dep-accent: var(--fg3);
  --dep-accent-soft: color-mix(in srgb, var(--dep-accent) 8%, transparent);
  --dep-accent-border: color-mix(in srgb, var(--dep-accent) 30%, var(--k-color-border));
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 5.35rem;
  border: 1px solid color-mix(in srgb, var(--k-color-border) 80%, transparent);
  border-radius: 10px;
  padding: 0.58rem 0.72rem 0.62rem 3.32rem;
  background: var(--k-card-bg);
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;

  &:hover {
    border-color: var(--dep-accent-border);
    box-shadow: none;
    transform: none;
  }

  &.expandable { cursor: pointer; }

  &.expanded {
    z-index: 8;
    border-color: var(--dep-accent-border);
    box-shadow: none;
    overflow: visible;

    .dep-card-buttons {
      justify-content: flex-end;
      flex-wrap: wrap;
    }
  }

  // left accent bar
  &::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    border-radius: 10px 0 0 10px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--dep-accent) 82%, transparent), color-mix(in srgb, var(--dep-accent) 24%, transparent));
  }

  // status-specific accents
  &.pending   { --dep-accent: var(--k-color-primary); }
  &.updatable { --dep-accent: var(--k-color-success); }
  &.error     { --dep-accent: var(--danger); border-color: var(--dep-accent-border); }
  &.invalid   { --dep-accent: var(--warning); border-color: var(--dep-accent-border); }
  &.bundle    { --dep-accent: #9b74df; }
  &.unconfigured, &.workspace { --dep-accent: var(--warning); }
  &.manual    { --dep-accent: var(--k-color-primary); }
  &.ignored, &.check-disabled { --dep-accent: var(--fg3); }

  &.installed {
    &::before { background: color-mix(in srgb, var(--dep-accent) 45%, transparent); }
  }

  // Polished mode adds richer state glow from the page-level stylesheet.
  &:not(.installed)::after {
    display: none;
  }
}

.dep-status-mark {
  position: absolute;
  left: 0.68rem;
  top: 0.62rem;
  display: grid;
  place-items: center;
  width: 1.78rem;
  height: 1.78rem;
  border: 1px solid color-mix(in srgb, var(--dep-accent) 28%, var(--k-color-border));
  border-radius: 10px;
  color: var(--dep-accent);
  background: color-mix(in srgb, var(--dep-accent) 14%, var(--k-side-bg));

  .market-icon {
    width: 0.96rem;
    height: 0.96rem;
  }
}

.dep-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.dep-header-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
}

.dep-title {
  flex: 1 1 auto;
  min-width: 0;

  h3 {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.3;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.dep-title-line {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.dep-full-name {
  display: block;
  margin-top: 0.12rem;
  color: var(--fg3);
  font-size: 0.73rem;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dep-summary-text {
  margin: 0.26rem 0 0;
  color: var(--fg2);
  font-size: 0.76rem;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dep-badge {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.25rem;
  height: 1.15rem;
  border-radius: 6px;
  padding: 0 0.36rem;
  font-size: 0.7rem;
  color: var(--fg2);
  background: var(--k-side-bg);

  .market-icon {
    width: 0.78rem;
    height: 0.78rem;
    flex: 0 0 auto;
  }

  &.pending {
    color: var(--k-color-primary);
    background: color-mix(in srgb, var(--k-color-primary) 10%, transparent);
  }

  &.updatable {
    color: var(--k-color-success);
    background: color-mix(in srgb, var(--k-color-success) 10%, transparent);
  }

  &.error {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 9%, transparent);
  }

  &.workspace {
    color: var(--warning);
  }

  &.unconfigured {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 10%, transparent);
  }

  &.ignored {
    color: var(--fg2);
    background: color-mix(in srgb, var(--fg3) 10%, transparent);
  }
}

.dep-kind-pill {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.24rem;
  height: 1.16rem;
  border: 1px solid color-mix(in srgb, var(--dep-accent) 22%, var(--k-color-border));
  border-radius: 6px;
  padding: 0 0.42rem 0 0.26rem;
  color: var(--dep-accent);
  background: color-mix(in srgb, var(--dep-accent) 9%, transparent);
  font-size: 0.7rem;
  font-weight: 500;
  white-space: nowrap;

  .dep-kind-icon {
    display: inline-grid;
    place-items: center;
    width: 0.86rem;
    height: 0.86rem;
    flex: 0 0 auto;
    border-radius: 4px;
    background: color-mix(in srgb, var(--dep-accent) 14%, transparent);
  }

  .market-icon {
    width: 0.66rem;
    height: 0.66rem;
    display: block;
  }
}

.dep-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem 0.36rem;
  margin-top: 0.34rem;
}

.dep-meta-item {
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 0.25rem;
  border: 1px solid color-mix(in srgb, var(--k-color-border) 72%, transparent);
  border-radius: 6px;
  padding: 0.12rem 0.36rem;
  background: color-mix(in srgb, var(--k-side-bg) 88%, transparent);
  font-size: 0.76rem;
  line-height: 1.35;

  span {
    flex: 0 0 auto;
    color: var(--fg3);
  }

  strong {
    min-width: 0;
    color: var(--fg1);
    font-weight: 500;
    overflow-wrap: anywhere;

    &.danger {
      color: var(--danger);
    }

    &.warning {
      color: var(--warning);
    }
  }
}

.dep-status-text {
  margin: 0.32rem 0 0;
  color: var(--fg2);
  font-size: 0.78rem;
  line-height: 1.35;
  overflow-wrap: anywhere;

  &.danger {
    color: var(--danger);
  }
}

.dep-card-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.44rem;
  border-top: 1px dashed color-mix(in srgb, var(--k-color-border) 76%, transparent);
  padding-top: 0.42rem;
  cursor: default;
  animation: dep-actions-in 0.18s ease;

  .el-select {
    flex: 1 1 auto;
    min-width: 0;
  }

  &.floating {
    position: absolute;
    left: 0.62rem;
    right: 0.62rem;
    top: calc(100% - 0.22rem);
    z-index: 12;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    margin-top: 0;
    border: 1px solid color-mix(in srgb, var(--dep-accent) 28%, var(--k-color-border));
    border-radius: 8px;
    padding: 0.54rem;
    background: var(--k-card-bg);
    box-shadow: none;

    &::before {
      content: '';
      position: absolute;
      left: 1.25rem;
      top: -5px;
      width: 9px;
      height: 9px;
      border-top: 1px solid color-mix(in srgb, var(--dep-accent) 28%, var(--k-color-border));
      border-left: 1px solid color-mix(in srgb, var(--dep-accent) 28%, var(--k-color-border));
      background: var(--k-card-bg);
      transform: rotate(45deg);
    }

    .dep-card-buttons {
      justify-content: flex-end;
    }
  }
}

@keyframes dep-actions-in {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.dep-card-buttons {
  display: flex;
  flex: 0 0 auto;
  gap: 0.38rem;
}

.dep-remove-button {
  --remove-color: color-mix(in srgb, var(--danger) 72%, #ff9a9a);
  --remove-border: color-mix(in srgb, var(--danger) 42%, var(--k-color-border));
  --remove-bg: color-mix(in srgb, var(--danger) 10%, transparent);
  --remove-bg-hover: color-mix(in srgb, var(--danger) 16%, transparent);
  border-color: var(--remove-border);
  color: var(--remove-color);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--danger) 8%, transparent), transparent),
    var(--remove-bg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--danger) 8%, transparent);

  &:hover, &:focus {
    border-color: color-mix(in srgb, var(--danger) 56%, var(--k-color-border));
    color: color-mix(in srgb, var(--danger) 84%, #ffc0c0);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--danger) 12%, transparent), transparent),
      var(--remove-bg-hover);
  }

  &:active {
    background: color-mix(in srgb, var(--danger) 20%, transparent);
  }
}

.dep-muted {
  min-width: 0;
  color: var(--fg2);
  font-size: 0.8rem;
  line-height: 1.3;
}

@media (max-width: 420px) {
  .dep-package-card {
    padding-left: 0.76rem;
  }

  .dep-status-mark {
    display: none;
  }

  .dep-card-header, .dep-card-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .dep-header-actions {
    justify-content: flex-end;
  }

  .dep-card-buttons {
    justify-content: flex-end;
  }
}

@media (max-width: 768px) {
  .dep-card-actions.floating {
    position: static;
    display: flex;
    margin-top: 0.56rem;
    border-top: 1px dashed color-mix(in srgb, var(--k-color-border) 76%, transparent);
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 0;
    padding: 0.52rem 0 0;
    background: transparent;
    box-shadow: none;

    &::before {
      display: none;
    }
  }
}

// List row layout
.dep-list-row {
  --dep-accent: var(--fg3);
  display: grid;
  grid-template-columns: var(--deps-list-columns, 2rem minmax(14rem, 1fr) 8rem 9rem 24rem);
  column-gap: 0.5rem;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 0.32rem 0.75rem 0.32rem 0.62rem;
  background: var(--k-card-bg);
  border-bottom: 1px solid color-mix(in srgb, var(--k-color-border) 50%, transparent);
  transition: background 0.12s;

  &:last-child { border-bottom: none; }
  &:hover { background: color-mix(in srgb, var(--k-side-bg) 60%, transparent); }

  .dep-status-mark {
    position: static;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 6px;
    margin: 0;
    justify-self: center;
  }

  .col-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;

    .name-display {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.875rem;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      .name-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .dep-list-kind-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.24rem;
      height: 1.05rem;
      padding: 0 0.34rem;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, #9b74df 28%, var(--k-color-border));
      color: #9b74df;
      background: color-mix(in srgb, #9b74df 9%, transparent);
      font-size: 0.68rem;
      font-weight: 500;
      line-height: 1;
      white-space: nowrap;

      .market-icon {
        width: 0.68rem;
        height: 0.68rem;
        flex: 0 0 auto;
      }
    }

    .name-full {
      font-size: 0.7rem;
      color: var(--fg3);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .col-version, .col-latest {
    min-width: 0;
    font-size: 0.8rem;
    color: var(--fg2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 0.25rem;

    &.has-update { color: var(--k-color-success); font-weight: 600; }
    &.pending-val { color: var(--k-color-primary); font-weight: 600; }
  }

  .col-actions {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .dep-list-select {
    width: 8rem;
    flex: 0 0 8rem;
  }

  &.pending   { --dep-accent: var(--k-color-primary); background: color-mix(in srgb, var(--k-color-primary) 4%, var(--k-card-bg)); }
  &.bundle    { --dep-accent: #9b74df; background: color-mix(in srgb, #9b74df 4%, var(--k-card-bg)); }
  &.updatable { --dep-accent: var(--k-color-success); }
  &.error, &.invalid { --dep-accent: var(--danger); background: color-mix(in srgb, var(--danger) 4%, var(--k-card-bg)); }
  &.unconfigured { --dep-accent: var(--warning); background: color-mix(in srgb, var(--warning) 3%, var(--k-card-bg)); }

  .dep-status-mark {
    color: var(--dep-accent);
    border-color: color-mix(in srgb, var(--dep-accent) 28%, var(--k-color-border));
    background: color-mix(in srgb, var(--dep-accent) 12%, var(--k-side-bg));
  }
}

@media (max-width: 768px) {
  .dep-list-row {
    grid-template-columns: 1.8rem minmax(0, 1fr) auto;
    grid-template-areas:
      "icon name actions"
      "icon current actions"
      "icon latest actions";
    row-gap: 0.18rem;
    column-gap: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--k-color-border) 64%, transparent);
    border-radius: 8px;
    padding: 0.55rem 0.62rem;

    .dep-status-mark {
      grid-area: icon;
      align-self: start;
      margin-top: 0.08rem;
    }

    .col-name {
      grid-area: name;
    }

    .col-version {
      grid-area: current;
      padding: 0;

      &::before {
        content: '当前 ';
        color: var(--fg3);
        font-weight: 500;
      }
    }

    .col-latest {
      grid-area: latest;
      padding: 0;

      &::before {
        content: '目标 ';
        color: var(--fg3);
        font-weight: 500;
      }
    }

    .col-actions {
      grid-area: actions;
      align-self: center;
      flex-direction: column;
      align-items: stretch;
      justify-content: center;
      max-width: 8.5rem;

      .el-button {
        margin-left: 0;
      }
    }

    .dep-list-select {
      width: 8.5rem;
      flex-basis: 8.5rem;
    }
  }
}

@media (max-width: 420px) {
  .dep-list-row {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "name"
      "current"
      "latest"
      "actions";

    .dep-status-mark {
      display: none;
    }

    .col-actions {
      max-width: none;
      margin-top: 0.32rem;
      flex-direction: row;
      flex-wrap: wrap;

      .el-button {
        flex: 1 1 auto;
      }
    }

    .dep-list-select {
      width: 100%;
      flex: 1 1 100%;
    }
  }
}

</style>

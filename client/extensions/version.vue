<template>
  <!-- navigation -->
  <div class="navigation flex flex-wrap gap-x-4 gap-y-2 my-8" v-if="object || showDependencyUninstall">
    <a class="el-button" target="_blank"
      v-if="object?.package.links.homepage"
      :href="object.package.links.homepage"
    >插件主页</a>
    <a class="el-button" target="_blank"
      v-if="object?.package.links.npm && local?.package.version"
      :href="object.package.links.npm + '/v/' + local.package.version"
    >当前版本：{{ local.package.version }}</a>
    <a class="el-button" target="_blank"
      v-if="object?.package.links.repository"
      :href="object.package.links.repository"
    >存储库</a>
    <a class="el-button" target="_blank"
      v-if="object?.package.links.bugs"
      :href="object.package.links.bugs"
    >问题反馈</a>
    <el-button
      v-if="showDependencyUninstall"
      :class="{ 'dependency-remove-button': !pendingRemove }"
      :loading="uninstalling || loadingBundleRecord"
      @click="pendingRemove ? cancelPendingUninstall() : requestUninstall()"
    >
      {{ pendingRemove ? '取消卸载' : bundleRecord ? '卸载插件包' : '卸载插件' }}
    </el-button>
  </div>

  <!-- latest -->
  <k-comment v-if="updateAvailable && !global.static">
    <p>当前的插件版本不是最新，<router-link to="/dependencies">点击前往依赖管理</router-link>。</p>
  </k-comment>

  <!-- deprecated -->
  <k-comment v-if="versions?.[dep?.resolved]?.deprecated" type="danger">
    <p>此版本已废弃，请尽快迁移：{{ versions[dep.resolved].deprecated }}</p>
  </k-comment>

  <!-- external -->
  <k-comment type="warning" v-if="local && !local.workspace && store.dependencies && !store.dependencies[name]">
    <p>尚未将当前插件列入依赖，<span class="k-link" @click="addDependency">点击添加</span>。</p>
  </k-comment>

  <el-dialog v-model="showUninstallDialog" title="确认卸载插件" destroy-on-close>
    检测到当前插件存在配置。是否同时删除配置？
    <template #footer>
      <el-button @click="showUninstallDialog = false">取消</el-button>
      <el-button type="primary" @click="uninstallDependency(false)">仅卸载插件</el-button>
      <el-button type="danger" @click="uninstallDependency(true)">卸载并删除配置</el-button>
    </template>
  </el-dialog>

  <bundle-uninstall
    v-model="showBundleUninstallDialog"
    :package-name="name"
    :record="bundleRecord"
  ></bundle-uninstall>
</template>

<script lang="ts" setup>

import { global, message, send, store, useConfig, useContext } from '@koishijs/client'
import { computed, inject, ComputedRef, ref } from 'vue'
import { getBulkMode, getBundleRecords, getMarketNextPolicy, getPendingOverrides, getRemoveConfig, getWritableBundleRecords, hasUpdate, patchMarketNextData } from '../utils'
import type {} from '@koishijs/plugin-config'
import type { PluginBundleRecord } from '../../src/shared/bundle'
import {
  createLocalBundleRecord,
  ensureInstalledConfig,
  fetchBundleRecord,
  install,
  pendingBundleUninstalls,
  type BundleRecordView,
} from '../components/utils'
import BundleUninstall from '../components/bundle-uninstall.vue'

const ctx = useContext()
const config = useConfig()
const name = inject<ComputedRef<string>>('plugin:name')
const protectedDeps = new Set(['@koishijs/plugin-console', '@koishijs/plugin-config', '@koishijs/plugin-server'])

const local = computed(() => store.packages?.[name.value])
const object = computed(() => store.market?.data?.[name.value])
const dep = computed(() => store.dependencies?.[name.value])
const versions = computed(() => store.registry?.[name.value])
const updateAvailable = computed(() => hasUpdate(name.value, getMarketNextPolicy(config.value)))
const uninstalling = ref(false)
const loadingBundleRecord = ref(false)
const showUninstallDialog = ref(false)
const showBundleUninstallDialog = ref(false)
const remoteBundleRecord = ref<BundleRecordView>()

const pendingRemove = computed(() => {
  const override = getPendingOverrides()
  return Object.prototype.hasOwnProperty.call(override, name.value) && !override[name.value]
})

const hasConfigEntries = computed(() => {
  return !!ctx.configWriter?.get(name.value)?.length
})

const bundleRecord = computed<BundleRecordView | PluginBundleRecord | undefined>(() => {
  const stored = getBundleRecords(config.value)[name.value]
  if (stored) return stored
  if (remoteBundleRecord.value?.package === name.value) return remoteBundleRecord.value
  return createLocalBundleRecord(name.value)
})

const showDependencyUninstall = computed(() => {
  if (global.static || protectedDeps.has(name.value)) return false
  if (local.value?.workspace || dep.value?.workspace) return false
  if (pendingRemove.value) return true
  if (store.dependencies) return !!dep.value
  return !!local.value
})

async function addDependency() {
  if (!local.value?.package.version) return
  await install({ [name.value]: local.value.package.version }, async () => {
    await ensureInstalledConfig(ctx, name.value, true)
  }, undefined, {
    loadingText: '正在添加依赖……',
    successText: '依赖已添加。',
    errorText: '依赖添加失败！',
    timeoutText: '依赖添加超时！',
  })
}

function ensureOverride() {
  return getPendingOverrides()
}

async function requestUninstall() {
  if (!name.value || uninstalling.value) return
  if (bundleRecord.value) {
    await loadRemoteBundleRecord()
    showBundleUninstallDialog.value = true
    return
  }
  if (getBulkMode(config.value)) {
    const override = ensureOverride()
    override[name.value] = ''
    void patchMarketNextData({ override: { ...override } })
    message.success('卸载已暂存，应用更改后生效。')
    return
  }
  const savedRemoveConfig = getRemoveConfig(config.value)
  if (hasConfigEntries.value && typeof savedRemoveConfig !== 'boolean') {
    showUninstallDialog.value = true
    return
  }
  return uninstallDependency(savedRemoveConfig === true)
}

async function loadRemoteBundleRecord() {
  if (!name.value || getBundleRecords(config.value)[name.value]) return
  if (remoteBundleRecord.value?.package === name.value && remoteBundleRecord.value.members.length) return
  loadingBundleRecord.value = true
  try {
    const record = await fetchBundleRecord(name.value)
    if (record) remoteBundleRecord.value = record
  } catch (error) {
    console.warn(error)
    message.warning('未能读取插件包成员清单，将只卸载插件包自身。')
  } finally {
    loadingBundleRecord.value = false
  }
}

function cancelPendingUninstall() {
  const pendingBundle = pendingBundleUninstalls.value[name.value]
  const override = ensureOverride()
  delete override[name.value]
  for (const member of pendingBundle?.members ?? []) {
    delete override[member]
  }
  void patchMarketNextData({ override: { ...override } })
  delete pendingBundleUninstalls.value[name.value]
  message.success('已取消卸载。')
}

async function uninstallDependency(removeConfig: boolean) {
  if (!name.value || uninstalling.value) return
  showUninstallDialog.value = false
  uninstalling.value = true
  try {
    await install({ [name.value]: '' }, async () => {
      if (removeConfig) ctx.configWriter?.remove(name.value)
      const records = getWritableBundleRecords(config.value)
      delete records[name.value]
      const saved = await patchMarketNextData({ bundleRecords: records })
      if (!saved) message.warning('插件包归属记录保存失败，请刷新后确认。')
    }, undefined, {
      loadingText: '正在卸载插件……',
      successText: '卸载成功！',
      errorText: '卸载失败！',
      timeoutText: '卸载超时！',
    })
  } finally {
    uninstalling.value = false
  }
}

</script>

<style lang="scss" scoped>

.dependency-remove-button {
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

</style>

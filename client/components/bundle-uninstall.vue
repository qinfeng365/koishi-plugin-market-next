<template>
  <el-dialog
    v-model="visible"
    append-to-body
    :class="['bundle-uninstall-dialog', modeClass]"
    :title="title || '卸载插件包'"
    width="min(760px, calc(100vw - 24px))"
    destroy-on-close
  >
    <template v-if="packageName">
      <div class="bundle-uninstall-body">
        <p>
          <strong>{{ recordView?.label || packageName }}</strong>
          是一个插件包。将卸载插件包自身；成员插件按下方选择处理。
        </p>

        <p class="bundle-package-name">{{ packageName }}</p>

        <k-comment v-if="recordView?.fallback" type="warning">
          <p>未找到 NEXT 写入的安装归属记录；当前是根据包名或远端清单识别的插件包。默认更保守：只清理包分组配置，不主动卸载成员依赖。</p>
        </k-comment>

        <div v-if="loadingRecord" class="bundle-loading">正在读取插件包成员清单……</div>

        <template v-else-if="memberRows.length">
          <!-- Bulk Operations Bar -->
          <div class="bundle-bulk-row">
            <span class="bulk-label">批量操作:</span>
            <button class="bundle-section-action" @click="setAllActions('dependency')">全部卸载依赖并清配置</button>
            <span class="bundle-section-spacer">|</span>
            <button class="bundle-section-action" @click="setAllActions('config')">全部只清配置</button>
            <span class="bundle-section-spacer">|</span>
            <button class="bundle-section-action" @click="setAllActions('keep')">全部保留</button>
          </div>

          <div class="bundle-member-list">
            <section v-for="row in memberRows" :key="row.package" class="bundle-member-option">
              <div class="member-main">
                <span class="member-title">{{ row.package }}</span>
                <span class="member-meta">
                  {{ row.required ? '核心成员' : '可选成员' }} · {{ row.version || '未声明版本' }}
                </span>
              </div>
              <div class="member-state">
                <span>{{ row.installed ? '依赖已安装' : '依赖未安装' }}</span>
                <span v-if="row.hasGroupConfig">包内配置</span>
                <span v-if="row.hasExternalConfig" class="warning">存在包外配置</span>
                <span v-if="row.workspace">工作区依赖</span>
              </div>
              <el-radio-group v-model="memberActions[row.package]" size="small">
                <el-radio-button value="config" :disabled="!row.hasGroupConfig">只清包内配置</el-radio-button>
                <el-radio-button value="dependency" :disabled="!row.canRemoveDependency">
                  卸载依赖并清配置
                </el-radio-button>
                <el-radio-button value="keep">保留</el-radio-button>
              </el-radio-group>
              <p v-if="row.hasExternalConfig" class="member-note">
                检测到根层级或其他分组仍有配置，默认只清理插件包分组下的副本，不卸载成员依赖。
              </p>
            </section>
          </div>
        </template>

        <k-comment v-else>
          <p>没有读取到可处理的成员清单。将只卸载插件包自身。</p>
        </k-comment>

        <div class="bundle-summary">
          <span>卸载成员依赖：{{ dependencyRemovalCount }}</span>
          <span>清理包内配置：{{ configCleanupCount }}</span>
          <span>保留成员：{{ keepCount }}</span>
        </div>

        <p class="bundle-uninstall-note">
          包分组外的配置永远不会被删除；只要某个成员存在包外配置，NEXT 默认不会卸载它的依赖。
        </p>
      </div>
    </template>
    <template v-else>
      <k-comment type="warning">
        <p>没有找到这个分组对应的插件包依赖。</p>
      </k-comment>
    </template>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="danger" :loading="loadingRecord || uninstalling" :disabled="!packageName" @click="uninstallBundle">
        卸载插件包
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">

import { computed, reactive, ref, watch } from 'vue'
import { message, router, send, store, useConfig, useContext } from '@koishijs/client'
import { getBundleGroupIdent, type PluginBundleRecord } from '../../src/shared/bundle'
import {
  fetchBundleRecord,
  getBundleMemberConfigState,
  install,
  pendingBundleUninstalls,
  type BundleRecordView,
  type BundleMemberCleanupTarget,
} from './utils'
import { getBulkMode, getFrontendMode, getPendingOverrides, getWritableBundleRecords, patchMarketNextData } from '../utils'

type MemberAction = 'config' | 'dependency' | 'keep'

const protectedDeps = new Set(['@koishijs/plugin-console', '@koishijs/plugin-config', '@koishijs/plugin-server'])

const props = defineProps<{
  modelValue: boolean
  packageName?: string
  record?: BundleRecordView | PluginBundleRecord
  title?: string
  redirectToPlugins?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  done: []
}>()

const config = useConfig()
const frontendMode = computed(() => getFrontendMode(config.value))
const modeClass = computed(() => `market-mode-${frontendMode.value}`)

function setAllActions(action: MemberAction) {
  for (const row of memberRows.value) {
    if (action === 'dependency') {
      memberActions[row.package] = row.canRemoveDependency ? 'dependency' : (row.hasGroupConfig ? 'config' : 'keep')
    } else if (action === 'config') {
      memberActions[row.package] = row.hasGroupConfig ? 'config' : 'keep'
    } else {
      memberActions[row.package] = 'keep'
    }
  }
}
const ctx = useContext()
const loadingRecord = ref(false)
const uninstalling = ref(false)
const remoteRecord = ref<BundleRecordView>()
const memberActions = reactive<Record<string, MemberAction>>({})

const packageName = computed(() => props.packageName || '')
const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const recordView = computed(() => {
  if (props.record?.members?.length) return props.record
  if (remoteRecord.value?.package === packageName.value) return remoteRecord.value
  return props.record
})

const memberRows = computed(() => {
  const groupKey = recordView.value?.groupKey || (packageName.value ? `group:${getBundleGroupIdent(packageName.value)}` : undefined)
  return (recordView.value?.members ?? []).map((member) => {
    const dep = store.dependencies?.[member.package]
    const state = getBundleMemberConfigState(ctx, member, groupKey)
    const installed = !!dep
    const blocked = !!dep?.workspace || !!dep?.invalid || protectedDeps.has(member.package)
    const hasExternalConfig = !!state.external.length
    return {
      ...member,
      installed,
      workspace: !!dep?.workspace,
      hasGroupConfig: !!state.group.length,
      hasExternalConfig,
      canRemoveDependency: installed && !blocked && !hasExternalConfig,
    }
  })
})

const dependencyRemovalMembers = computed(() => memberRows.value
  .filter(row => memberActions[row.package] === 'dependency' && row.canRemoveDependency))
const configCleanupMembers = computed(() => memberRows.value
  .filter(row => memberActions[row.package] === 'dependency' || memberActions[row.package] === 'config')
  .filter(row => row.hasGroupConfig))
const dependencyRemovalCount = computed(() => dependencyRemovalMembers.value.length)
const configCleanupCount = computed(() => configCleanupMembers.value.length)
const keepCount = computed(() => Math.max(0, memberRows.value.length - new Set([
  ...dependencyRemovalMembers.value.map(row => row.package),
  ...configCleanupMembers.value.map(row => row.package),
]).size))

watch(visible, async (value) => {
  if (!value) return
  remoteRecord.value = undefined
  await loadRecord()
  resetActions()
}, { immediate: true })

watch(memberRows, () => {
  if (visible.value) resetActions(false)
})

async function loadRecord() {
  const name = packageName.value
  if (!name || props.record?.members?.length) return
  loadingRecord.value = true
  try {
    const record = await fetchBundleRecord(name)
    if (record) remoteRecord.value = record
  } catch (error) {
    console.warn(error)
    message.warning('未能读取插件包成员清单，将只卸载插件包自身。')
  } finally {
    loadingRecord.value = false
  }
}

function resetActions(force = true) {
  const seen = new Set<string>()
  for (const row of memberRows.value) {
    seen.add(row.package)
    if (!force && memberActions[row.package]) continue
    memberActions[row.package] = getDefaultAction(row)
  }
  for (const key of Object.keys(memberActions)) {
    if (!seen.has(key)) delete memberActions[key]
  }
}

function getDefaultAction(row: (typeof memberRows.value)[number]): MemberAction {
  if (row.hasExternalConfig) return row.hasGroupConfig ? 'config' : 'keep'
  if (row.canRemoveDependency && row.installedByBundle === true) return 'dependency'
  if (row.hasGroupConfig) return 'config'
  return 'keep'
}

function ensureOverride() {
  return getPendingOverrides()
}

function getCleanupTargets(): BundleMemberCleanupTarget[] {
  return configCleanupMembers.value.map(member => ({
    package: member.package,
    plugin: member.plugin,
  }))
}

async function uninstallBundle() {
  const name = packageName.value
  if (!name || uninstalling.value) return
  const members = dependencyRemovalMembers.value.map(member => member.package)
  const configs = getCleanupTargets()
  const override = {
    [name]: '',
    ...Object.fromEntries(members.map(name => [name, ''])),
  }

  if (getBulkMode(config.value)) {
    const overrides = ensureOverride()
    Object.assign(overrides, override)
    void patchMarketNextData({ override: { ...overrides } })
    pendingBundleUninstalls.value[name] = {
      members,
      cleanup: !!configs.length,
      configs,
    }
    visible.value = false
    message.success(`插件包卸载已暂存，卸载成员 ${members.length} 项，清理配置 ${configs.length} 项，应用更改后生效。`)
    return
  }

  visible.value = false
  uninstalling.value = true
  try {
    await install(override, async () => {
      if (configs.length) {
        await send('market/remove-bundle-configs', {
          package: name,
          members: configs,
          removeEmptyGroup: true,
        })
      }
      const records = getWritableBundleRecords(config.value)
      delete records[name]
      const saved = await patchMarketNextData({ bundleRecords: records })
      if (!saved) message.warning('插件包归属记录保存失败，请刷新后确认。')
      if (props.redirectToPlugins) await router.replace('/plugins')
      emit('done')
    }, undefined, {
      loadingText: '正在卸载插件包……',
      successText: '插件包卸载成功！',
      errorText: '插件包卸载失败！',
      timeoutText: '插件包卸载超时！',
    })
  } finally {
    uninstalling.value = false
  }
}

</script>

<style lang="scss" scoped>

:global(.bundle-uninstall-dialog) {
  --bundle-uninstall-primary: var(--k-color-primary, var(--el-color-primary, #8b5cf6));
  --bundle-uninstall-surface: var(--k-card-bg, var(--el-bg-color-overlay, var(--el-bg-color, #ffffff)));
  --bundle-uninstall-surface-muted: var(--k-side-bg, var(--el-fill-color-lighter, var(--bundle-uninstall-surface)));
  --bundle-uninstall-text: var(--fg1, var(--el-text-color-primary, currentColor));
  --bundle-uninstall-text-muted: var(--fg2, var(--el-text-color-regular, currentColor));
  --bundle-uninstall-border-base: var(--k-color-border, var(--el-border-color, #dcdfe6));
  --bundle-uninstall-border: color-mix(in srgb, var(--bundle-uninstall-border-base) 82%, var(--bundle-uninstall-text) 10%);
  color: var(--bundle-uninstall-text);
  border: 1px solid var(--bundle-uninstall-border);
  border-radius: 10px;
  background: var(--bundle-uninstall-surface);
  box-shadow: none;

  :deep(.el-dialog__header) {
    border-bottom: 1px solid color-mix(in srgb, var(--bundle-uninstall-border) 68%, transparent);
    background: color-mix(in srgb, var(--bundle-uninstall-surface-muted) 54%, var(--bundle-uninstall-surface));
  }

  :deep(.el-dialog__body) {
    max-height: min(68vh, 620px);
    overflow: auto;
    background: var(--bundle-uninstall-surface);
  }

  :deep(.el-dialog__footer) {
    padding-top: 0.25rem;
    border-top: 1px solid color-mix(in srgb, var(--bundle-uninstall-border) 72%, transparent);
    background: color-mix(in srgb, var(--bundle-uninstall-surface) 86%, var(--bundle-uninstall-surface-muted) 14%);
  }

  :deep(.el-radio-group) {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
  }

  :deep(.el-radio-button) {
    min-width: 0;
  }

  :deep(.el-radio-button__inner) {
    width: 100%;
    padding: 0 0.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bundle-uninstall-body {
    display: grid;
    gap: 0.75rem;
    min-width: 0;

    p {
      margin: 0;
      color: var(--fg2);
      line-height: 1.5;
    }
  }

  .bundle-package-name {
    padding: 0.45rem 0.6rem;
    border-radius: 8px;
    background: color-mix(in srgb, var(--bundle-uninstall-primary) 7%, var(--bundle-uninstall-surface));
    color: var(--fg1);
    font-family: var(--font-mono);
    word-break: break-all;
  }

  .bundle-member-list {
    display: grid;
    gap: 0.55rem;
    max-height: 46vh;
    overflow: auto;
    padding-right: 0.25rem;
  }

  .bundle-member-option {
    display: grid;
    gap: 0.45rem;
    min-width: 0;
    padding: 0.58rem 0.65rem;
    border: 1px solid color-mix(in srgb, var(--bundle-uninstall-border) 72%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bundle-uninstall-surface-muted) 72%, var(--bundle-uninstall-surface));
  }

  .member-main,
  .member-state,
  .bundle-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.6rem;
  }

  .member-main,
  .member-state {
    min-width: 0;
  }

  .member-title {
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: break-all;
  }

  .member-meta,
  .member-state {
    color: var(--fg3);
    font-size: 0.78rem;
  }

  .member-state span {
    border-radius: 999px;
    padding: 0.08rem 0.42rem;
    background: color-mix(in srgb, var(--fg3) 9%, transparent);
  }

  .member-state .warning {
    color: var(--k-color-warning);
    background: color-mix(in srgb, var(--k-color-warning) 10%, transparent);
  }

  .member-note {
    font-size: 0.78rem;
  }

  .bundle-summary,
  .bundle-uninstall-note {
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
    background: color-mix(in srgb, var(--bundle-uninstall-primary) 7%, var(--bundle-uninstall-surface));
  }

  .bundle-loading {
    color: var(--fg2);
  }

  .bundle-bulk-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.65rem;
    background: color-mix(in srgb, var(--bundle-uninstall-primary) 4%, var(--bundle-uninstall-surface-muted));
    border: 1px solid color-mix(in srgb, var(--bundle-uninstall-primary) 12%, var(--bundle-uninstall-border));
    border-radius: 8px;
    font-size: 0.76rem;

    .bulk-label {
      font-weight: 600;
      color: var(--fg2);
      margin-right: 0.4rem;
    }

    .bundle-section-spacer {
      color: color-mix(in srgb, var(--fg3) 50%, transparent);
      margin: 0 0.2rem;
    }

    .bundle-section-action {
      border: none;
      background: none;
      color: var(--bundle-uninstall-primary);
      cursor: pointer;
      font-size: 0.74rem;
      padding: 2px 6px;
      border-radius: 6px;
      transition: background 0.15s;
      &:hover { background: color-mix(in srgb, var(--bundle-uninstall-primary) 8%, transparent); }
    }
  }

  &.market-mode-polished {
    border-radius: 16px;
    border-color: color-mix(in srgb, var(--bundle-uninstall-primary) 14%, var(--bundle-uninstall-border));
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--bundle-uninstall-primary) 5%, transparent), transparent 42%),
      var(--bundle-uninstall-surface);
    box-shadow: 0 18px 42px color-mix(in srgb, var(--bundle-uninstall-text) 12%, transparent);

    .bundle-member-option {
      border-radius: 12px;
      background: color-mix(in srgb, var(--bundle-uninstall-surface) 90%, var(--bundle-uninstall-surface-muted) 10%);
      backdrop-filter: blur(10px);
      box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bundle-uninstall-surface) 86%, white 14%);
      transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;

      &:hover {
        border-color: color-mix(in srgb, var(--bundle-uninstall-primary) 28%, var(--bundle-uninstall-border));
        box-shadow: 0 8px 20px color-mix(in srgb, var(--bundle-uninstall-primary) 10%, transparent);
        transform: translateY(-2px);
      }
    }
  }

  @media (max-width: 640px) {
    :deep(.el-dialog__footer) {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      flex-wrap: wrap;
    }

    :deep(.el-radio-group) {
      grid-template-columns: 1fr;
    }

    :deep(.el-radio-button__inner) {
      text-align: center;
    }
  }
}

</style>

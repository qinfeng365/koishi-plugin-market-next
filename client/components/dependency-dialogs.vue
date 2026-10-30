<template>
  <market-dialog
    v-model="ignoreVisible"
    width="520px"
    append-to-body
    destroy-on-close
    :title="t('dependencyCard.ignore.title')"
  >
    <div class="dep-dialog-body">
      <p>{{ t('dependencyCard.ignore.intro', { name: displayName, version: ignoreVersion }) }}</p>
      <el-radio-group v-model="ignoreMode" class="dep-ignore-mode">
        <el-radio value="version">{{ t('dependencyCard.ignore.thisVersion') }}</el-radio>
        <el-radio value="package">{{ t('dependencyCard.ignore.permanent') }}</el-radio>
      </el-radio-group>
      <template v-if="ignoreMode === 'version'">
        <div class="dep-ignore-field">
          <span>{{ t('dependencyCard.ignore.duration') }}</span>
          <el-select v-model="ignoreDurationPreset">
            <el-option value="forever" :label="t('dependencyCard.ignore.forever')"></el-option>
            <el-option value="1d" :label="t('dependencyCard.ignore.day', { count: 1 })"></el-option>
            <el-option value="7d" :label="t('dependencyCard.ignore.day', { count: 7 })"></el-option>
            <el-option value="30d" :label="t('dependencyCard.ignore.day', { count: 30 })"></el-option>
            <el-option value="custom" :label="t('dependencyCard.ignore.custom')"></el-option>
          </el-select>
        </div>
        <div v-if="ignoreDurationPreset === 'custom'" class="dep-ignore-field">
          <span>{{ t('dependencyCard.ignore.customDays') }}</span>
          <el-input-number v-model="ignoreCustomDays" :min="1" :max="3650" :step="1" controls-position="right"></el-input-number>
        </div>
        <div class="dep-ignore-field">
          <span>{{ t('dependencyCard.ignore.versionCount') }}</span>
          <el-input-number v-model="ignoreCount" :min="1" :max="20" :step="1" controls-position="right"></el-input-number>
        </div>
      </template>
      <p class="dep-dialog-note">
        {{ ignoreMode === 'package' ? t('dependencyCard.ignore.permanentNote') : t('dependencyCard.ignore.durationNote') }}
      </p>
    </div>
    <template #footer>
      <el-button @click="ignoreVisible = false">{{ t('dependencyCard.ignore.cancel') }}</el-button>
      <el-button type="primary" :loading="ignoreSaving.has(dependencyDialog.name)" @click="confirmIgnoreUpdate">{{ t('dependencyCard.ignore.confirm') }}</el-button>
    </template>
  </market-dialog>

  <market-dialog
    v-model="localBindingVisible"
    width="520px"
    append-to-body
    destroy-on-close
    :title="t('dependencyCard.localBinding.title')"
  >
    <div class="dep-dialog-body">
      <p>{{ t('dependencyCard.localBinding.description', { name: displayName }) }}</p>
      <k-comment type="warning"><p>{{ t('dependencyCard.localBinding.note') }}</p></k-comment>
    </div>
    <template #footer>
      <el-button @click="localBindingVisible = false">{{ t('dependencyCard.localBinding.cancel') }}</el-button>
      <el-button type="primary" :loading="bindingLocalPackages.has(dependencyDialog.name)" @click="confirmLocalBinding">{{ t('dependencyCard.localBinding.confirm') }}</el-button>
    </template>
  </market-dialog>

  <bundle-uninstall
    v-model="bundleUninstallVisible"
    :package-name="dependencyDialog.name"
    :record="bundleRecord"
  ></bundle-uninstall>

  <package-history
    v-model="historyVisible"
    :package-name="dependencyDialog.name"
    :current-version="installedVersion"
    @select-version="selectHistoryVersion"
  ></package-history>
</template>

<script lang="ts" setup>

import { computed, onBeforeUnmount, onDeactivated, reactive, ref, watch } from 'vue'
import { message, send, useConfig } from '@koishijs/client'
import { createUpdateIgnoreRule, day, getMarketNextPolicy, getOfferedVersion, getPendingOverrides, getWritableMarketNextPolicy, patchMarketNextData, persistUpdatePolicy } from '../utils'
import { bindingLocalPackages, dependencyDialog, DependencyDialogType, findBundleRecord, formatShortname, getInstalledVersion, setPendingVersion } from './utils'
import BundleUninstall from './bundle-uninstall.vue'
import PackageHistory from './package-history.vue'
import { useMarketNextI18n } from '../i18n'
import MarketDialog from './market-dialog.vue'

const config = useConfig()
const { t } = useMarketNextI18n()

function useVisible(type: DependencyDialogType) {
  return computed({
    get: () => dependencyDialog.type === type,
    set: (value: boolean) => {
      if (!value && dependencyDialog.type === type) dependencyDialog.type = undefined
    },
  })
}

const ignoreVisible = useVisible('ignore')
const localBindingVisible = useVisible('local-binding')
const bundleUninstallVisible = useVisible('bundle-uninstall')
const historyVisible = useVisible('history')

const displayName = computed(() => formatShortname(dependencyDialog.name))
const bundleRecord = computed(() => findBundleRecord(dependencyDialog.name))
const installedVersion = computed(() => getInstalledVersion(dependencyDialog.name))
const ignoreVersion = computed(() => getOfferedVersion(dependencyDialog.name, getMarketNextPolicy(config.value)))

const ignoreMode = ref<'version' | 'package'>('version')
const ignoreDurationPreset = ref<'forever' | '1d' | '7d' | '30d' | 'custom'>('forever')
const ignoreCustomDays = ref(7)
const ignoreCount = ref(1)
// Package names with a request in flight. A request can outlive its dialog, so it only closes
// the dialog if that dialog still shows the same package.
const ignoreSaving = reactive(new Set<string>())

// The console keeps pages alive, and the dialogs are teleported to the body, so leaving the page
// has to close them or they stay on top of the next page.
onDeactivated(() => dependencyDialog.type = undefined)
onBeforeUnmount(() => dependencyDialog.type = undefined)

// The form starts from the current policy each time it opens.
watch(ignoreVisible, (visible) => {
  if (!visible) return
  const policy = getMarketNextPolicy(config.value)
  const duration = Math.max(0, policy.updateIgnoreDays ?? 0) * day
  ignoreDurationPreset.value = duration === 0 ? 'forever'
    : duration === day ? '1d'
    : duration === 7 * day ? '7d'
    : duration === 30 * day ? '30d'
    : 'custom'
  ignoreCustomDays.value = Math.max(1, Math.ceil(duration / day))
  ignoreCount.value = Math.max(1, Math.min(20, Math.floor(policy.updateIgnoreVersions || 1)))
  ignoreMode.value = 'version'
}, { flush: 'sync' })

async function confirmIgnoreUpdate() {
  const name = dependencyDialog.name
  const mode = ignoreMode.value
  if (ignoreSaving.has(name)) return
  const policy = getWritableMarketNextPolicy(config.value)
  policy.updateIgnored ||= {}
  if (mode === 'package') {
    const names = (policy.updateIgnoredPackages ?? '').split(/[\s,，;；]+/g).filter(Boolean)
    if (!names.some(item => item.toLowerCase() === name.toLowerCase())) names.push(name)
    policy.updateIgnoredPackages = names.join('\n')
    delete policy.updateIgnored[name]
  } else {
    const preset = ignoreDurationPreset.value
    const rule = createUpdateIgnoreRule(name, getMarketNextPolicy(config.value), {
      duration: preset === 'custom' ? Math.max(1, Math.min(3650, Math.floor(ignoreCustomDays.value))) * day
        : preset === 'forever' ? 0
        : Number.parseInt(preset) * day,
      count: ignoreCount.value,
    })
    if (!rule) return
    policy.updateIgnored[name] = rule
  }
  ignoreSaving.add(name)
  const saved = await persistUpdatePolicy()
  ignoreSaving.delete(name)
  if (!saved) {
    message.error(t('common.messages.saveFailed'))
    return
  }
  if (dependencyDialog.type === 'ignore' && dependencyDialog.name === name) dependencyDialog.type = undefined
  message.success(mode === 'package' ? t('dependencyCard.ignore.addedToDisabled') : t('dependencyCard.ignore.saved'))
}

async function confirmLocalBinding() {
  const name = dependencyDialog.name
  if (bindingLocalPackages.has(name)) return
  bindingLocalPackages.add(name)
  try {
    const result = await send('market/prepare-local-binding', name)
    if (!result?.request) throw new Error('invalid local binding result')
    getPendingOverrides()[name] = result.request
    const saved = await patchMarketNextData({ override: { ...getPendingOverrides() } })
    if (!saved) {
      delete getPendingOverrides()[name]
      throw new Error('failed to save local binding override')
    }
    if (dependencyDialog.type === 'local-binding' && dependencyDialog.name === name) dependencyDialog.type = undefined
    message.success(t('dependencyCard.localBinding.prepared'))
  } catch (error) {
    console.error(error)
    message.error(t('dependencyCard.localBinding.failed'))
  } finally {
    bindingLocalPackages.delete(name)
  }
}

function selectHistoryVersion(version: string) {
  if (!version || version === installedVersion.value) return
  setPendingVersion(dependencyDialog.name, version)
}

</script>

<style lang="scss">

.dep-dialog-body {
  display: grid;
  gap: 0.875rem;

  p {
    margin: 0;
    line-height: 1.6;
  }

  .dep-ignore-mode {
    display: grid;
    gap: 0.25rem;

    .el-radio {
      margin-right: 0;
    }
  }

  .dep-ignore-field {
    display: grid;
    grid-template-columns: 8rem minmax(0, 12rem);
    align-items: center;
    gap: 0.75rem;

    > span {
      color: var(--fg2);
    }

    .el-input-number,
    .el-select {
      width: 100%;
    }
  }

  .dep-dialog-note {
    color: var(--fg3);
    font-size: 0.875rem;
  }
}

@media (max-width: 480px) {
  .dep-dialog-body .dep-ignore-field {
    grid-template-columns: 1fr;
    gap: 0.375rem;
  }
}

</style>

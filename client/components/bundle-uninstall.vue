<template>
  <market-dialog
    v-model="visible"
    append-to-body
    class="bundle-uninstall-dialog"
    width="720px"
    destroy-on-close
  >
    <template #header="{ titleId, titleClass }">
      <span :id="titleId" :class="titleClass">{{ title || t('bundle.actions.uninstall') }}</span>
      <div v-if="packageName" class="bundle-meta">
        <template v-if="recordView?.label">{{ recordView.label }} · </template>{{ packageName }}
      </div>
    </template>

    <template v-if="packageName">
      <p class="dialog-intro">{{ t('bundle.messages.uninstallIntro') }}</p>

      <k-comment v-if="recordView?.fallback" type="warning">
        <p>{{ t('bundle.messages.fallbackRecord') }}</p>
      </k-comment>

      <div v-if="loadingRecord" class="bundle-state">{{ t('bundle.loading') }}</div>

      <section v-else-if="memberRows.length" class="dialog-section">
        <div class="dialog-section-title">
          <span>{{ t('bundle.members.title') }}</span>
          <span class="dialog-count">{{ memberRows.length }}</span>
        </div>
        <div class="dialog-list" :style="{ '--bundle-columns': columns.length }">
          <bundle-all-row :columns="columns"></bundle-all-row>
          <div v-for="row in memberRows" :key="row.package" class="dialog-list-row bundle-member">
            <div class="member-main">
              <div class="member-line">
                <span class="member-name">{{ formatShortname(row.package) }}</span>
                <span class="member-version">{{ row.version || t('bundle.members.notDeclared') }}</span>
                <span class="dialog-tag">{{ row.required ? t('bundle.members.requiredTag') : t('bundle.members.optionalTag') }}</span>
                <span v-if="row.hasGroupConfig" class="dialog-tag">{{ t('bundle.members.groupConfig') }}</span>
                <span v-if="row.hasExternalConfig" class="dialog-tag warning">{{ t('bundle.members.externalConfig') }}</span>
                <span v-if="row.workspace" class="dialog-tag">{{ t('bundle.members.workspace') }}</span>
              </div>
              <div class="member-sub">
                {{ row.package }} · {{ row.installed ? t('bundle.members.dependencyInstalled') : t('bundle.members.dependencyNotInstalled') }}
              </div>
              <p v-if="row.hasExternalConfig" class="member-note warning">{{ t('bundle.conflict.externalNote') }}</p>
            </div>
            <el-checkbox
              :model-value="cleans(row)"
              :disabled="!row.hasGroupConfig"
              :aria-label="`${t('bundle.members.cleanConfig')}: ${row.package}`"
              @update:model-value="setChoice(row, 'clean', !!$event)"
            ></el-checkbox>
            <el-checkbox
              :model-value="removes(row)"
              :disabled="!row.canRemoveDependency"
              :aria-label="`${t('bundle.members.removeDependency')}: ${row.package}`"
              @update:model-value="setChoice(row, 'remove', !!$event)"
            ></el-checkbox>
          </div>
        </div>
      </section>

      <k-comment v-else>
        <p>{{ t('bundle.messages.noMembers') }}</p>
      </k-comment>

      <template v-if="!loadingRecord">
        <bundle-diff :rows="diffRows"></bundle-diff>
        <p class="bundle-outside-note">{{ t('bundle.messages.outsideConfig') }}</p>
      </template>
    </template>
    <k-comment v-else type="warning">
      <p>{{ t('bundle.messages.noDependency') }}</p>
    </k-comment>

    <template #footer>
      <el-button @click="visible = false">{{ t('bundle.actions.cancel') }}</el-button>
      <el-button type="danger" :loading="loadingRecord || uninstalling" :disabled="!packageName" @click="uninstallBundle">
        {{ t('bundle.actions.uninstall') }}
      </el-button>
    </template>
  </market-dialog>
</template>

<script setup lang="ts">

import { computed, reactive, ref, watch } from 'vue'
import { message, router, send, store, useConfig, useContext } from '@koishijs/client'
import { getBundleGroupIdent, type PluginBundleRecord } from '../../src/shared/bundle'
import {
  fetchBundleRecord,
  formatShortname,
  getBundleMemberConfigState,
  install,
  pendingBundleUninstalls,
  type BundleRecordView,
  type BundleMemberCleanupTarget,
} from './utils'
import { getBulkMode, getPendingOverrides, getWritableBundleRecords, patchMarketNextData } from '../utils'
import { useMarketNextI18n } from '../i18n'
import BundleAllRow from './bundle-all-row.vue'
import BundleDiff from './bundle-diff.vue'
import MarketDialog from './market-dialog.vue'

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
const { t } = useMarketNextI18n()

// Cleaning the config and uninstalling the dependency are independent: like Koishi's own uninstall,
// a dependency can go while its config stays in the bundle group for a later reinstall. That is
// intended, not a leftover. Each column of the "all members" row covers the members that have that
// option, and a bulk "uninstall" only checks dependencies the bundle installed itself, like the
// default; ones the user installed before the bundle need their own row checked.
const columns = computed(() => {
  const removable = memberRows.value.filter(row => row.canRemoveDependency)
  return [
    {
      label: t('bundle.members.cleanConfig'),
      members: memberRows.value.filter(row => row.hasGroupConfig),
      get: cleans,
      set: (row: MemberRow, value: boolean) => setChoice(row, 'clean', value),
    },
    {
      label: t('bundle.members.removeDependency'),
      members: removable,
      targets: removable.filter(row => row.installedByBundle === true),
      get: removes,
      set: (row: MemberRow, value: boolean) => setChoice(row, 'remove', value),
    },
  ]
})
const ctx = useContext()
const loadingRecord = ref(false)
let loadSerial = 0
const uninstalling = ref(false)
const remoteRecord = ref<BundleRecordView>()
// Only the choices the user changed are stored; anything else falls back to the default, so rows that
// appear or gain an option need no setup. Keyed by package: a manifest that lists a package twice
// already gets a validation warning.
const choices = reactive<Record<string, { clean?: boolean, remove?: boolean }>>({})

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

type MemberRow = (typeof memberRows.value)[number]

// Whether a member's config is cleaned and its dependency removed. Group configs are cleaned by default,
// and only dependencies the bundle installed itself are removed by default.
function cleans(row: MemberRow) {
  return row.hasGroupConfig && (choices[row.package]?.clean ?? true)
}

function removes(row: MemberRow) {
  return row.canRemoveDependency && (choices[row.package]?.remove ?? row.installedByBundle === true)
}

function setChoice(row: MemberRow, key: 'clean' | 'remove', value: boolean) {
  (choices[row.package] ||= {})[key] = value
}

const dependencyRemovalMembers = computed(() => memberRows.value.filter(removes))
const configCleanupMembers = computed(() => memberRows.value.filter(cleans))
// Kept configs get their own row, so it is clear which ones stay behind in the bundle group.
const diffRows = computed(() => [
  { label: t('bundle.diff.uninstall'), items: [packageName.value, ...dependencyRemovalMembers.value.map(row => row.package)].map(name => ({ name: formatShortname(name) })) },
  { label: t('bundle.diff.clean'), items: configCleanupMembers.value.map(row => ({ name: formatShortname(row.package) })) },
  { label: t('bundle.diff.keepConfig'), items: memberRows.value.filter(row => row.hasGroupConfig && !cleans(row)).map(row => ({ name: formatShortname(row.package) })) },
])

// The dialog is modal, so its bundle can't change while it is open; choices reset each time it opens.
watch(visible, async (value, previous) => {
  if (!value) {
    if (!previous) return
    // Drops a load still running for the dialog that just closed.
    loadSerial++
    loadingRecord.value = false
    return
  }
  remoteRecord.value = undefined
  // Reopening starts from the defaults again.
  Object.keys(choices).forEach(key => delete choices[key])
  await loadRecord()
}, { immediate: true })

// The serial drops the result of a load that a newer one replaced, e.g. the dialog was reopened for another bundle.
async function loadRecord() {
  const serial = ++loadSerial
  const name = packageName.value
  if (!name || props.record?.members?.length) return
  loadingRecord.value = true
  try {
    const record = await fetchBundleRecord(name)
    if (record && serial === loadSerial) remoteRecord.value = record
  } catch (error) {
    console.warn(error)
    if (serial === loadSerial) message.warning(t('bundle.messages.recordFailed'))
  } finally {
    if (serial === loadSerial) loadingRecord.value = false
  }
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

  if (getBulkMode()) {
    const overrides = ensureOverride()
    Object.assign(overrides, override)
    void patchMarketNextData({ override: { ...overrides } })
    pendingBundleUninstalls.value[name] = {
      members,
      cleanup: !!configs.length,
      configs,
    }
    visible.value = false
    message.success(t('bundle.messages.stagedUninstall', { members: members.length, configs: configs.length }))
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
      // Configs the user chose to keep stay behind in the bundle group, which then becomes an ordinary
      // group on the plugin config page, like the configs Koishi keeps when one plugin is uninstalled.
      const records = getWritableBundleRecords(config.value)
      delete records[name]
      const saved = await patchMarketNextData({ bundleRecords: records })
      if (!saved) message.warning(t('bundle.messages.recordSaveFailed'))
      if (props.redirectToPlugins) await router.replace('/plugins')
      emit('done')
    }, undefined, {
      loadingText: t('bundle.messages.uninstalling'),
      successText: t('bundle.messages.uninstalled'),
      errorText: t('bundle.messages.uninstallFailed'),
      timeoutText: t('bundle.messages.uninstallTimeout'),
    })
  } finally {
    uninstalling.value = false
  }
}

</script>

<style lang="scss">

.bundle-uninstall-dialog {
  // Keeps the title and package name clear of the close button.
  .el-dialog__header {
    padding-right: 36px;
  }

  .member-main .member-note {
    margin-top: 0.25rem;
  }

  .bundle-outside-note {
    margin: 1rem 0 0;
    color: var(--fg3);
    font-size: 0.8125rem;
  }

}

</style>

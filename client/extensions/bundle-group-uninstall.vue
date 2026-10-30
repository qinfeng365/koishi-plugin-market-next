<template>
  <bundle-uninstall
    v-model="visible"
    :package-name="packageName"
    :record="record"
    redirect-to-plugins
  ></bundle-uninstall>
</template>

<script setup lang="ts">

import { computed, ref, watch } from 'vue'
import { message, useConfig } from '@koishijs/client'
import {
  fetchBundleRecord,
  resolveBundlePackageFromGroup,
  resolveBundleRecordFromGroup,
  type BundleRecordView,
} from '../components/utils'
import { getBundleRecords } from '../utils'
import { bundleGroupUninstallTarget } from './bundle-group-uninstall'
import BundleUninstall from '../components/bundle-uninstall.vue'
import { useMarketNextI18n } from '../i18n'

const config = useConfig()
const { t } = useMarketNextI18n()
const loadingBundleRecord = ref(false)
const remoteBundleRecord = ref<BundleRecordView>()

const target = computed(() => bundleGroupUninstallTarget.value)
const packageName = computed(() => {
  return resolveBundlePackageFromGroup(target.value?.path, getBundleRecords(config.value))
})
const record = computed(() => {
  const name = packageName.value
  if (!name) return
  const records = getBundleRecords(config.value)
  const stored = records[name]
  if (stored) return stored
  if (remoteBundleRecord.value?.package === name) return remoteBundleRecord.value
  return resolveBundleRecordFromGroup(target.value?.path, records)
})

const visible = computed({
  get: () => !!bundleGroupUninstallTarget.value,
  set: (value) => {
    if (!value) bundleGroupUninstallTarget.value = undefined
  },
})

watch(target, async (value) => {
  remoteBundleRecord.value = undefined
  if (!value) return
  await loadRemoteBundleRecord()
}, { immediate: true })

async function loadRemoteBundleRecord() {
  const name = packageName.value
  if (!name || getBundleRecords(config.value)[name]) return
  loadingBundleRecord.value = true
  try {
    const next = await fetchBundleRecord(name)
    if (next) remoteBundleRecord.value = next
  } catch (error) {
    console.warn(error)
    message.warning(t('extensions.messages.bundleRecordFailedShort'))
  } finally {
    loadingBundleRecord.value = false
  }
}

</script>

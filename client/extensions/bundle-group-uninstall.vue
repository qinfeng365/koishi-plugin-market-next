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

const config = useConfig()
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
    message.warning('未能读取插件包成员清单，将只卸载插件包自身。')
  } finally {
    loadingBundleRecord.value = false
  }
}

</script>

<style lang="scss" scoped>

.bundle-group-uninstall-dialog {
  .bundle-group-uninstall-body {
    display: grid;
    gap: 0.75rem;

    p {
      margin: 0;
      color: var(--fg2);
      line-height: 1.5;
    }
  }

  .bundle-package-name {
    padding: 0.45rem 0.6rem;
    border-radius: 8px;
    background: color-mix(in srgb, var(--k-color-primary) 7%, transparent);
    color: var(--fg1);
    font-family: var(--font-mono);
    word-break: break-all;
  }

  .bundle-member-option {
    display: block;
    margin: 0.35rem 0;
    padding: 0.5rem 0.6rem;
    border: 1px solid color-mix(in srgb, var(--k-color-border) 72%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--k-side-bg) 72%, transparent);
  }

  .member-title {
    font-weight: 600;
  }

  .member-meta {
    margin-left: 0.5rem;
    color: var(--fg3);
    font-size: 0.78rem;
  }

  .bundle-uninstall-note {
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
    background: color-mix(in srgb, var(--k-color-primary) 7%, transparent);
  }
}

</style>

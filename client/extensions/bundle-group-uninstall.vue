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

<style lang="scss" scoped>

.bundle-group-uninstall-dialog {
  --bundle-group-surface: var(--k-card-bg, var(--el-bg-color-overlay, var(--el-bg-color, #ffffff)));
  --bundle-group-surface-muted: var(--k-side-bg, var(--el-fill-color-lighter, var(--bundle-group-surface)));
  --bundle-group-border: var(--k-color-border, var(--el-border-color, #dcdfe6));
  --bundle-group-primary: var(--k-color-primary, var(--el-color-primary, #8b5cf6));

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
    background: color-mix(in srgb, var(--bundle-group-primary) 7%, var(--bundle-group-surface));
    color: var(--fg1);
    font-family: var(--font-mono);
    word-break: break-all;
  }

  .bundle-member-option {
    display: block;
    margin: 0.35rem 0;
    padding: 0.5rem 0.6rem;
    border: 1px solid color-mix(in srgb, var(--bundle-group-border) 72%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bundle-group-surface-muted) 72%, var(--bundle-group-surface));
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
    background: color-mix(in srgb, var(--bundle-group-primary) 7%, var(--bundle-group-surface));
  }
}

</style>

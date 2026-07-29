<template>
  <el-dialog
    v-model="visible"
    append-to-body
    align-center
    :class="['market-dialog', 'market-dialog--small', 'market-config-remove-dialog', modeClass]"
    :title="title"
    destroy-on-close
  >
    <template v-if="target">
      {{ content }}
    </template>
    <template #footer>
      <el-button @click="visible = false">{{ t('extensions.actions.cancel') }}</el-button>
      <el-button type="danger" :loading="removing" @click="remove">{{ t('common.actions.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">

import { computed, ref } from 'vue'
import { message, router, send, useConfig } from '@koishijs/client'
import { configRemoveTarget } from './config-remove'
import { useMarketNextI18n } from '../i18n'
import { getFrontendMode } from '../utils'

const removing = ref(false)
const { t } = useMarketNextI18n()
const config = useConfig()
const modeClass = computed(() => `market-mode-${getFrontendMode(config.value)}`)

const target = computed(() => configRemoveTarget.value)

const visible = computed({
  get: () => !!configRemoveTarget.value,
  set: (value) => {
    if (!value) configRemoveTarget.value = undefined
  },
})

const title = computed(() => {
  return target.value?.children ? t('extensions.actions.removeGroupTitle') : t('extensions.actions.removeConfigTitle')
})

const content = computed(() => {
  const item = target.value
  if (!item) return ''
  if (item.children) {
    return t('extensions.messages.removeGroupConfirm', { name: item.label || item.path })
  }
  return t('extensions.messages.removeConfigConfirm', { name: item.label || item.name })
})

async function remove() {
  const item = target.value
  if (!item || removing.value) return
  removing.value = true
  try {
    await send('manager/remove', item.parent?.path ?? '', item.id)
    configRemoveTarget.value = undefined
    await router.replace('/plugins/' + (item.parent?.path ?? ''))
  } catch (error) {
    console.error(error)
    message.error(t('extensions.messages.configRemoveFailed'))
  } finally {
    removing.value = false
  }
}

</script>


<template>
  <k-comment type="danger">
    <p>
      <span>{{ t('extensions.missing.notInstalled') }}</span>
      <span v-if="fullname" class="k-link" @click="active = fullname">{{ t('extensions.missing.quickInstall') }}</span>
      <span v-else class="k-link" @click="gotoMarket">{{ t('extensions.missing.goMarket') }}</span>
    </p>
  </k-comment>
</template>

<script setup lang="ts">

import { computed, inject, watch, WritableComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import { active } from '../utils'
import { useMarketNextI18n } from '../i18n'
import { getMarketObject, loadMarketObjects } from '../market/state'

const router = useRouter()
const { t } = useMarketNextI18n()

const current = inject<WritableComputedRef<any>>('manager.settings.current')

function getCandidates(name: string) {
  return name.startsWith('@')
    ? [name.replace(/\//, '/koishi-plugin-')]
    : [`@koishijs/plugin-${name}`, `koishi-plugin-${name}`]
}

const fullname = computed(() => {
  const { name } = current.value
  return getCandidates(name).find(name => !!getMarketObject(name))
})

watch(() => current.value?.name, (name) => {
  if (!name) return
  void loadMarketObjects(getCandidates(name)).catch(error => {
    console.error('[market-next] failed to resolve missing plugin', error)
  })
}, { immediate: true })

function gotoMarket() {
  router.push('/market?keyword=' + current.value.name)
}

</script>

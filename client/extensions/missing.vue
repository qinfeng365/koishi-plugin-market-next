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

import { computed, inject, WritableComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '@koishijs/client'
import { active } from '../utils'
import { useMarketNextI18n } from '../i18n'

const router = useRouter()
const { t } = useMarketNextI18n()

const current = inject<WritableComputedRef<any>>('manager.settings.current')

const fullname = computed(() => {
  const { name } = current.value
  const candidates = name.startsWith('@')
    ? [name.replace(/\//, '/koishi-plugin-')]
    : [`@koishijs/plugin-${name}`, `koishi-plugin-${name}`]
  return candidates.find(name => name in (store.market?.data ?? {}))
})

function gotoMarket() {
  router.push('/market?keyword=' + current.value.name)
}

</script>

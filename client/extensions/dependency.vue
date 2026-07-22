<template>
  <k-comment
    v-for="({ required, active }, name) in env.peer" :key="name"
    :type="active ? 'success' : required ? 'warning' : 'primary'">
    <p>
      {{ required ? t('extensions.dependency.requiredDependency') : t('extensions.dependency.optionalDependency') }}: <k-dep-link :name="name"></k-dep-link>
    </p>
  </k-comment>
  <k-comment
    v-for="({ required }, name) in env.using" :key="name"
    :type="name in store.services ? 'success' : required ? 'warning' : 'primary'">
    <p>
      {{ required ? t('extensions.dependency.requiredService') : t('extensions.dependency.optionalService') }}: {{ name }}
      <span v-if="name in store.services">{{ t('extensions.dependency.clickLoaded') }}</span>
      <span v-else-if="available[name].length">({{ t('extensions.dependency.serviceHint') }})</span>
      <span v-else>({{ t('extensions.dependency.unavailable') }})</span>
    </p>
    <ul v-if="!(name in store.services) && available[name].length">
      <li v-for="shortname in available[name]">
        <k-dep-link :name="shortname"></k-dep-link>
      </li>
    </ul>
  </k-comment>
</template>

<script lang="ts" setup>

import { Dict, store } from '@koishijs/client'
import { computed, inject, ComputedRef, watch } from 'vue'
import { EnvInfo } from '@koishijs/plugin-config/client'
import KDepLink from './dep-link.vue'
import { useMarketNextI18n } from '../i18n'
import { getMarketServiceProviders, loadMarketServiceProviders } from '../market/state'

const env = inject<ComputedRef<EnvInfo>>('plugin:env')
const { t } = useMarketNextI18n()

watch(() => Object.keys(env.value?.using ?? {}), (services) => {
  void loadMarketServiceProviders(services).catch(error => {
    console.error('[market-next] failed to load service providers', error)
  })
}, { immediate: true })

const available = computed(() => {
  const available: Dict<string[]> = {}
  for (const name in env.value.using) {
    available[name] = getMarketServiceProviders(name)
  }
  return available
})

</script>

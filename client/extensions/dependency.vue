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
import { computed, inject, ComputedRef } from 'vue'
import { EnvInfo } from '@koishijs/plugin-config/client'
import KDepLink from './dep-link.vue'
import { useMarketNextI18n } from '../i18n'

const env = inject<ComputedRef<EnvInfo>>('plugin:env')
const { t } = useMarketNextI18n()

const getImplements = (name: string) => ({
  ...(store.market?.data?.[name] ?? {}),
  ...(store.packages?.[name] ?? {}),
}.manifest?.service.implements ?? [])

const getAvailable = (name: string) => Object
  .values(store.market?.data ?? {})
  .filter(data => getImplements(data.package.name).includes(name))
  .map(data => data.package.name)

const available = computed(() => {
  const available: Dict<string[]> = {}
  for (const name in env.value.using) {
    available[name] = getAvailable(name)
  }
  return available
})

</script>

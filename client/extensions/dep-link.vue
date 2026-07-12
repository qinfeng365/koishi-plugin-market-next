<template>
  <span class="k-link" @click.stop="active = name">
    {{ name }}
  </span>
  <span v-if="store.packages[name]?.runtime?.id"> {{ t('extensions.dependency.clickLoaded') }}</span>
  <span v-else> {{ name in store.packages ? t('extensions.dependency.clickConfigure') : t('extensions.dependency.clickAdd') }}</span>
</template>

<script lang="ts" setup>

import { store } from '@koishijs/client'
import {} from '@koishijs/plugin-config'
import { active } from '../utils'
import { useMarketNextI18n } from '../i18n'

defineProps<{
  name: string
}>()

const { t } = useMarketNextI18n()

</script>

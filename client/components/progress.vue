<template>
  <k-status v-if="isLoading">
    <el-progress :indeterminate="!store.market" :percentage="percentage">
      {{ t('marketPage.progress.loading') }}
    </el-progress>
  </k-status>
</template>

<script lang="ts" setup>

import { store, useContext } from '@koishijs/client'
import { computed } from 'vue'
import { useMarketNextI18n } from '../i18n'

const ctx = useContext()
const { t } = useMarketNextI18n()

const isLoading = computed(() => {
  if (ctx.bail('activity', ctx.$router.pages['market'])) return false
  return !store.market || store.market.total > store.market.progress
})

const percentage = computed(() => {
  if (!store.market) return 50
  return 100 * store.market.progress / store.market.total
})

</script>

<style lang="scss">

.k-status .el-progress-bar {
  width: 120px;
  margin-right: 2px;
}

</style>

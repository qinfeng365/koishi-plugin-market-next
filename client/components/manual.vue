<template>
  <el-dialog v-if="store.market?.registry" v-model="showManual" class="manual-panel" destroy-on-close>
    <template #header>{{ t('operations.manual.title') }}</template>
    <k-comment type="warning">
      <p>{{ t('operations.manual.hint') }}<router-link to="/market">{{ t('operations.manual.market') }}</router-link>{{ t('operations.manual.hintAfter') }}</p>
    </k-comment>
    <el-input :class="{ invalid }" v-model="name" @keydown.enter.stop.prevent="onEnter" :placeholder="t('operations.manual.placeholder')"></el-input>
    <template v-if="remote">
      <p>{{ t('operations.manual.latest') }}: {{ remote['dist-tags']?.latest }}</p>
      <p>{{ t('operations.manual.description') }}: {{ remote.description }}</p>
    </template>
    <template #footer>
      <el-button @click="showManual = false">{{ t('operations.manual.cancel') }}</el-button>
      <el-button type="primary" :disabled="invalid" @click="onEnter">{{ t('operations.manual.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>

import { computed, ref, watch } from 'vue'
import type { Registry } from '@koishijs/registry'
import { store } from '@koishijs/client'
import { useDebounceFn } from '@vueuse/core'
import { showManual, addManual } from './utils'
import { getPendingOverrides, patchMarketNextData } from '../utils'
import { useMarketNextI18n } from '../i18n'

const { t } = useMarketNextI18n()

const invalid = computed(() => false)
const name = ref('')
const remote = ref<Registry>()

const fetchRemote = useDebounceFn(async (name2: string) => {
  try {
    const data = await addManual(name2)
    if (name2 === name.value) remote.value = data
  } catch {}
}, 500)

watch(name, (name2) => {
  if (name2 !== remote.value?.name) remote.value = null
  if (!name2) return remote.value = null
  fetchRemote(name2)
})

function onEnter() {
  if (!remote.value) return
  const { name } = remote.value
  const override = getPendingOverrides()
  override[name] = remote.value['dist-tags'].latest
  void patchMarketNextData({ override: { ...override } })
  showManual.value = false
}

</script>

<style lang="scss">

.manual-panel {
  .k-comment {
    margin-top: 0;
  }
}

</style>

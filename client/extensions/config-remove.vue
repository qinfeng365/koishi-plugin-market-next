<template>
  <el-dialog v-model="visible" :title="title" destroy-on-close>
    <template v-if="target">
      {{ content }}
    </template>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="danger" :loading="removing" @click="remove">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">

import { computed, ref } from 'vue'
import { message, router, send } from '@koishijs/client'
import { configRemoveTarget } from './config-remove'

const removing = ref(false)

const target = computed(() => configRemoveTarget.value)

const visible = computed({
  get: () => !!configRemoveTarget.value,
  set: (value) => {
    if (!value) configRemoveTarget.value = undefined
  },
})

const title = computed(() => {
  return target.value?.children ? '确认删除分组' : '确认删除配置'
})

const content = computed(() => {
  const item = target.value
  if (!item) return ''
  if (item.children) {
    return `确定要删除分组 ${item.label || item.path} 吗？此操作不可撤销！`
  }
  return `确定要删除插件 ${item.label || item.name} 的配置吗？此操作不可撤销！`
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
    message.error('删除配置失败，请检查日志。')
  } finally {
    removing.value = false
  }
}

</script>


<template>
  <slot name="header" v-bind="{ all, packages, hasFilter: hasFilter(modelValue) }"></slot>
  <template v-if="packages.length">
    <div class="package-list">
      <market-package
        v-for="data in visiblePackages"
        :key="data.package.name"
        class="k-card"
        :data="data"
        :gravatar="gravatar"
        @query="onQuery"
        #action
      >
        <slot name="action" v-bind="data"></slot>
      </market-package>
    </div>
    <div v-if="hasMore" ref="sentinel" class="load-more">
      <el-button text @click="loadMore">加载更多</el-button>
    </div>
    <div v-else class="load-complete">
      已显示全部 {{ packages.length }} 个插件
    </div>
  </template>
  <k-empty v-else>
    没有搜索到相关插件。
  </k-empty>
</template>

<script lang="ts" setup>

import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { SearchObject } from '@koishijs/registry'
import { getSorted, getFiltered, hasFilter, kConfig } from '../utils'
import MarketPackage from './package.vue'

const props = defineProps<{
  modelValue: string[],
  data: SearchObject[],
  installed?: (data: SearchObject) => boolean,
  gravatar?: string,
}>()

const emit = defineEmits(['update:modelValue', 'update:page'])

const config = inject(kConfig, {})

const all = computed(() => getSorted(props.data, props.modelValue))

const packages = computed(() => getFiltered(all.value, props.modelValue, config))

const batchSize = computed(() => {
  for (const word of props.modelValue) {
    if (word.startsWith('limit:')) {
      const size = parseInt(word.slice(6))
      if (size) return size
    }
  }
  return 24
})

const sentinel = ref<HTMLElement>()
const visible = ref(batchSize.value)
let observer: IntersectionObserver

const visiblePackages = computed(() => packages.value.slice(0, visible.value))

const hasMore = computed(() => visible.value < packages.value.length)

function updateObserver() {
  if (!observer || !sentinel.value) return
  observer.disconnect()
  if (hasMore.value) observer.observe(sentinel.value)
}

function loadMore() {
  if (!hasMore.value) return
  visible.value = Math.min(visible.value + batchSize.value, packages.value.length)
  nextTick(updateObserver)
}

function resetVisible(scroll = true) {
  visible.value = batchSize.value
  if (scroll) emit('update:page', 1)
  nextTick(updateObserver)
}

watch(() => props.modelValue.join('\n'), () => resetVisible(), { deep: true })

watch(() => packages.value.length, () => {
  visible.value = Math.min(Math.max(visible.value, batchSize.value), packages.value.length || batchSize.value)
  nextTick(updateObserver)
})

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) loadMore()
  }, { rootMargin: '240px 0px' })
  resetVisible(false)
})

onUnmounted(() => observer?.disconnect())

function onQuery(word: string) {
  const words = props.modelValue.slice()
  if (!words[words.length - 1]) words.pop()
  if (!words.includes(word)) words.push(word)
  words.push('')
  emit('update:modelValue', words)
}

</script>

<style lang="scss" scoped>

.package-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(336px, 1fr));
  gap: var(--card-margin);
  justify-items: center;
  flex: 1 0 auto;
}

.k-empty {
  flex: 1 0 auto;
}

.load-more, .load-complete {
  margin: var(--card-margin) 0;
  display: flex;
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

</style>

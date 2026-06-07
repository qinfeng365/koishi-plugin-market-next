<template>
  <slot name="header" v-bind="{ all, packages, hasFilter: hasFilter(modelValue) }"></slot>
  <template v-if="packages.length">
    <div ref="list" class="package-list">
      <div v-if="topSpacer" class="virtual-spacer" :style="{ height: topSpacer + 'px' }"></div>
      <market-package
        v-for="data in renderedPackages"
        :key="data.package.name"
        class="k-card"
        :data="data"
        :gravatar="gravatar"
        @query="onQuery"
        #action
      >
        <slot name="action" v-bind="data"></slot>
      </market-package>
      <div v-if="bottomSpacer" class="virtual-spacer" :style="{ height: bottomSpacer + 'px' }"></div>
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

import { computed, inject, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
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

const all = shallowRef<SearchObject[]>([])

const packages = shallowRef<SearchObject[]>([])

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
const list = ref<HTMLElement>()
const visible = ref(batchSize.value)
const columns = ref(1)
const rowHeight = ref(224)
const startIndex = ref(0)
const endIndex = ref(batchSize.value)
const topSpacer = ref(0)
const bottomSpacer = ref(0)
let observer: IntersectionObserver
let scrollParent: HTMLElement | Window
let resizeObserver: ResizeObserver
let observedList: HTMLElement | undefined
let frame = 0
let filterFrame = 0

const loadedPackages = computed(() => packages.value.slice(0, visible.value))

const renderedPackages = computed(() => loadedPackages.value.slice(startIndex.value, endIndex.value))

const hasMore = computed(() => visible.value < packages.value.length)

function updateObserver() {
  if (!observer || !sentinel.value) return
  observer.disconnect()
  if (hasMore.value) observer.observe(sentinel.value)
}

function loadMore() {
  if (!hasMore.value) return
  visible.value = Math.min(visible.value + batchSize.value, packages.value.length)
  nextTick(() => {
    updateObserver()
    updateVirtual()
  })
}

function resetVisible(scroll = true) {
  visible.value = batchSize.value
  if (scroll) emit('update:page', 1)
  startIndex.value = 0
  endIndex.value = batchSize.value
  topSpacer.value = 0
  bottomSpacer.value = 0
  nextTick(() => {
    bindList()
    measureLayout()
    updateObserver()
    updateVirtual()
  })
}

watch(() => props.modelValue.join('\n'), () => resetVisible(), { deep: true })

watch(() => [props.data, props.modelValue.join('\n')] as const, () => {
  schedulePackageUpdate()
}, { immediate: true })

watch(() => packages.value.length, () => {
  visible.value = Math.min(Math.max(visible.value, batchSize.value), packages.value.length || batchSize.value)
  nextTick(() => {
    bindList()
    measureLayout()
    updateObserver()
    updateVirtual()
  })
})

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) loadMore()
  }, { rootMargin: '240px 0px' })
  resizeObserver = new ResizeObserver(() => {
    measureLayout()
    scheduleVirtual()
  })
  resetVisible(false)
})

onUnmounted(() => {
  observer?.disconnect()
  resizeObserver?.disconnect()
  removeScrollListener()
  cancelAnimationFrame(frame)
  cancelAnimationFrame(filterFrame)
})

function schedulePackageUpdate() {
  cancelAnimationFrame(filterFrame)
  filterFrame = requestAnimationFrame(() => {
    const sorted = getSorted(props.data, props.modelValue)
    all.value = sorted
    packages.value = getFiltered(sorted, props.modelValue, config)
  })
}

function getScrollParent() {
  return list.value?.closest('.el-scrollbar')?.querySelector('.el-scrollbar__wrap') as HTMLElement || window
}

function bindList() {
  if (!list.value) return
  if (observedList === list.value && scrollParent) return
  removeScrollListener()
  if (observedList) resizeObserver?.unobserve(observedList)
  observedList = list.value
  scrollParent = getScrollParent()
  resizeObserver?.observe(observedList)
  addScrollListener()
}

function addScrollListener() {
  scrollParent?.addEventListener('scroll', scheduleVirtual, { passive: true })
}

function removeScrollListener() {
  scrollParent?.removeEventListener('scroll', scheduleVirtual)
}

function measureLayout() {
  if (!list.value) return
  const style = getComputedStyle(list.value)
  const gap = parseFloat(style.columnGap) || parseFloat(style.gap) || 16
  const width = list.value.clientWidth
  columns.value = Math.max(1, Math.floor((width + gap) / (336 + gap)))
  const card = list.value.querySelector<HTMLElement>('.market-package')
  rowHeight.value = (card?.offsetHeight || 202) + gap
}

function scheduleVirtual() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(updateVirtual)
}

function updateVirtual() {
  if (!list.value) return
  measureLayout()

  const scrollTop = scrollParent instanceof Window ? window.scrollY : scrollParent.scrollTop
  const viewportHeight = scrollParent instanceof Window ? window.innerHeight : scrollParent.clientHeight
  const listRect = list.value.getBoundingClientRect()
  const listTop = scrollParent instanceof Window
    ? listRect.top + window.scrollY
    : listRect.top - scrollParent.getBoundingClientRect().top + scrollParent.scrollTop
  const offset = Math.max(0, scrollTop - listTop)
  const totalRows = Math.ceil(loadedPackages.value.length / columns.value)
  const overscan = 3
  const startRow = Math.max(0, Math.floor(offset / rowHeight.value) - overscan)
  const visibleRows = Math.ceil(viewportHeight / rowHeight.value) + overscan * 2
  const endRow = Math.min(totalRows, startRow + visibleRows)

  startIndex.value = startRow * columns.value
  endIndex.value = Math.min(loadedPackages.value.length, endRow * columns.value)
  topSpacer.value = startRow * rowHeight.value
  bottomSpacer.value = Math.max(0, (totalRows - endRow) * rowHeight.value)

  const loadedHeight = listTop + totalRows * rowHeight.value
  if (hasMore.value && scrollTop + viewportHeight > loadedHeight - rowHeight.value * 4) {
    loadMore()
  }
}

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

.virtual-spacer {
  grid-column: 1 / -1;
  width: 100%;
  pointer-events: none;
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

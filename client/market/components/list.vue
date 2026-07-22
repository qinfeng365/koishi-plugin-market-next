<template>
  <div v-if="$slots.header" ref="header" class="market-list-header">
    <slot name="header" v-bind="{ all, packages, hasFilter: hasFilter(modelValue) }"></slot>
  </div>
  <template v-if="packages.length">
    <div ref="list" :class="['package-list', { settled }]">
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
      <el-button text @click="loadMore">{{ t('marketPage.list.loadMore') }}</el-button>
    </div>
    <div v-else :class="['load-complete', { 'market-end-easter': !hasFilter(modelValue) }]">
      <template v-if="!hasFilter(modelValue)">
        <k-icon name="koishi" class="market-end-easter__icon" aria-hidden="true"></k-icon>
        <span>{{ t('marketPage.easter.marketEnd') }}</span>
      </template>
      <template v-else>
        {{ t('marketPage.list.complete', { count: packages.length }) }}
      </template>
    </div>
  </template>
  <k-empty v-else>
    {{ t('marketPage.list.empty') }}
  </k-empty>
</template>

<script lang="ts" setup>

import { computed, inject, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { SearchObject } from '@koishijs/registry'
import { getFiltered, getSortedPrepared, getVisible, hasFilter, kConfig } from '../utils'
import MarketPackage from './package.vue'
import { useMarketNextI18n } from '../../i18n'

const props = defineProps<{
  modelValue: string[],
  data: SearchObject[],
  installed?: (data: SearchObject) => boolean,
  gravatar?: string,
  debug?: boolean,
  visibilityPrepared?: boolean,
}>()

const { t } = useMarketNextI18n()

const emit = defineEmits(['update:modelValue', 'update:page', 'debug'])

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

const header = ref<HTMLElement>()
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
let observedHeader: HTMLElement | undefined
let frame = 0
let filterFrame = 0
let settledTimer = 0
let lastVirtualDebugAt = 0
let listTop = 0
let debugState = {
  timings: {} as Record<string, number>,
  total: 0,
  matched: 0,
  visible: 0,
  rendered: 0,
}

const loadedPackages = computed(() => packages.value.slice(0, visible.value))

const renderedPackages = computed(() => loadedPackages.value.slice(startIndex.value, endIndex.value))

const hasMore = computed(() => visible.value < packages.value.length)

const settled = ref(false)

function markSettled() {
  clearTimeout(settledTimer)
  settledTimer = window.setTimeout(() => { settled.value = true }, 700)
}

watch(() => packages.value, () => { settled.value = false; markSettled() })

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
  clearTimeout(settledTimer)
})

function schedulePackageUpdate() {
  cancelAnimationFrame(filterFrame)
  filterFrame = requestAnimationFrame(() => {
    const start = props.debug ? performance.now() : 0
    const visible = props.visibilityPrepared ? props.data : getVisible(props.data, props.modelValue)
    const filtered = getFiltered(visible, props.modelValue, config)
    const sortedAt = props.debug ? performance.now() : 0
    all.value = visible
    packages.value = getSortedPrepared(filtered, props.modelValue, config)
    if (props.debug) {
      emitDebug({
        timings: {
          frontendFilter: sortedAt - start,
          frontendSort: performance.now() - sortedAt,
        },
        total: visible.length,
        matched: packages.value.length,
      })
    }
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
  if (observedHeader) resizeObserver?.unobserve(observedHeader)
  observedList = list.value
  observedHeader = header.value
  scrollParent = getScrollParent()
  resizeObserver?.observe(observedList)
  if (observedHeader) resizeObserver?.observe(observedHeader)
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
  const nextColumns = Math.max(1, Math.floor((width + gap) / (336 + gap)))
  const card = list.value.querySelector<HTMLElement>('.market-package')
  const nextRowHeight = (card?.offsetHeight || 202) + gap
  const nextListTop = getListTop()
  if (columns.value !== nextColumns) columns.value = nextColumns
  if (rowHeight.value !== nextRowHeight) rowHeight.value = nextRowHeight
  if (listTop !== nextListTop) listTop = nextListTop
}

function getListTop() {
  if (!list.value || !scrollParent) return 0
  const listRect = list.value.getBoundingClientRect()
  if (scrollParent instanceof Window) return listRect.top + window.scrollY
  const scrollRect = scrollParent.getBoundingClientRect()
  return listRect.top - scrollRect.top + scrollParent.scrollTop
}

function scheduleVirtual() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(updateVirtual)
}

function updateVirtual() {
  if (!list.value) return
  const start = props.debug ? performance.now() : 0

  const scrollTop = scrollParent instanceof Window ? window.scrollY : scrollParent.scrollTop
  const viewportHeight = scrollParent instanceof Window ? window.innerHeight : scrollParent.clientHeight
  const offset = Math.max(0, scrollTop - listTop)
  const totalRows = Math.ceil(loadedPackages.value.length / columns.value)
  const overscan = 3
  const startRow = Math.max(0, Math.floor(offset / rowHeight.value) - overscan)
  const visibleRows = Math.ceil(viewportHeight / rowHeight.value) + overscan * 2
  const endRow = Math.min(totalRows, startRow + visibleRows)

  const nextStartIndex = startRow * columns.value
  const nextEndIndex = Math.min(loadedPackages.value.length, endRow * columns.value)
  const nextTopSpacer = startRow * rowHeight.value
  const nextBottomSpacer = Math.max(0, (totalRows - endRow) * rowHeight.value)
  if (startIndex.value !== nextStartIndex) startIndex.value = nextStartIndex
  if (endIndex.value !== nextEndIndex) endIndex.value = nextEndIndex
  if (topSpacer.value !== nextTopSpacer) topSpacer.value = nextTopSpacer
  if (bottomSpacer.value !== nextBottomSpacer) bottomSpacer.value = nextBottomSpacer

  const loadedHeight = listTop + totalRows * rowHeight.value
  if (hasMore.value && scrollTop + viewportHeight > loadedHeight - rowHeight.value * 4) {
    loadMore()
  }
  if (props.debug) {
    const now = performance.now()
    if (now - lastVirtualDebugAt < 250) return
    lastVirtualDebugAt = now
    emitDebug({
      timings: {
        frontendVirtual: now - start,
      },
      visible: loadedPackages.value.length,
      rendered: renderedPackages.value.length,
    })
  }
}

function emitDebug(value: Partial<typeof debugState>) {
  debugState = {
    ...debugState,
    ...value,
    timings: {
      ...debugState.timings,
      ...value.timings,
    },
  }
  emit('debug', debugState)
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

@media (max-width: 420px) {
  .package-list {
    grid-template-columns: minmax(0, 1fr);
  }
}

.market-list-header {
  display: block;
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

.market-end-easter {
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  min-height: 4rem;
  padding: 0.75rem 1rem;
  text-align: center;
}

.market-end-easter__icon {
  width: 2rem;
  height: 2rem;
  color: color-mix(in srgb, var(--k-color-primary) 76%, var(--el-text-color-primary));
}

</style>

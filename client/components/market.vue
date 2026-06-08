<template>
  <k-layout main="darker" class="page-market" menu="market">
    <template #left>
      <el-scrollbar>
        <market-filter v-model="words" :data="visibleData"></market-filter>
      </el-scrollbar>
    </template>

    <div v-if="marketLoading">
      <div class="el-loading-spinner">
        <svg class="circular" viewBox="25 25 50 50">
          <circle class="path" cx="50" cy="50" r="20" fill="none"></circle>
        </svg>
        <p class="el-loading-text">正在加载插件市场……</p>
        <p class="market-loading-detail">Registry：{{ loadingEndpoint }}</p>
      </div>
      <k-comment v-if="loadingSlow" type="warning" class="market-loading-warning">
        <p>插件市场仍在等待网络响应，可能是当前市场源连接慢、代理不可用或首次冷启动没有本地缓存。</p>
        <p>
          Registry：{{ loadingEndpoint }}
          <template v-if="loadingTimeout">；超时：{{ loadingTimeout }}</template>
          <template v-if="loadingAutoRoute">；备用源自动路由已开启</template>
        </p>
      </k-comment>
    </div>

    <el-scrollbar ref="root" v-else-if="store.market.total">
      <market-list
        v-model="words"
        :data="data"
        :gravatar="config.market.gravatar || store.market.gravatar"
        :debug="!!store.market.debug"
        @debug="updateClientDebug"
        @update:page="scrollToTop">
        <template #header="{ hasFilter, all, packages }">
          <market-search v-model="words"></market-search>
          <div class="market-hint text-center">
            共搜索到 {{ hasFilter ? packages.length + ' / ' : '' }}{{ all.length }} 个插件。
          </div>
          <k-comment v-if="store.market.stale" type="warning" class="market-stale">
            <p>插件市场刷新失败，当前显示的是上一次成功加载的数据。</p>
            <p>
              Registry：{{ store.market.registry || '未知' }}
              <template v-if="store.market.error">；原因：{{ store.market.error }}</template>
            </p>
          </k-comment>
          <k-comment v-else-if="store.market.cached" type="warning" class="market-stale">
            <p>
              当前显示的是本地缓存的插件市场数据。
              <template v-if="store.market.refreshing">正在后台刷新最新数据……</template>
            </p>
            <p>
              Registry：{{ store.market.registry || '未知' }}
              <template v-if="store.market.cachedAt">；缓存时间：{{ formatTime(store.market.cachedAt) }}</template>
              <template v-if="store.market.validatedAt">；校验时间：{{ formatTime(store.market.validatedAt) }}</template>
            </p>
          </k-comment>
          <k-comment v-if="store.market.debug" type="primary" class="market-debug">
            <p>Debug 性能：{{ formatSource(store.market.debug.source) }} / {{ store.market.debug.endpoint || store.market.registry || '未知源' }}</p>
            <div class="market-debug-grid">
              <span v-for="item in debugItems" :key="item.label" class="market-debug-item">
                <span>{{ item.label }}</span>
                <span>{{ item.value }}</span>
              </span>
            </div>
            <div v-if="debugTimings.length" class="market-debug-timings">
              <span v-for="[key, value] in debugTimings" :key="key">{{ formatTimingName(key) }} {{ formatDuration(value) }}</span>
            </div>
            <div v-if="debugPhases.length" class="market-debug-timings">
              <span v-for="item in debugPhases" :key="item.label">{{ item.label }}：{{ item.value }}</span>
            </div>
            <div v-if="debugRoutes.length" class="market-debug-routes">
              <span v-for="route in debugRoutes" :key="route.endpoint" class="market-debug-route">
                {{ shortEndpoint(route.endpoint) }} score={{ formatScore(route.score) }}
                <template v-if="route.averageElapsed"> avg={{ formatDuration(route.averageElapsed) }}</template>
                <template v-if="route.contentEncoding"> {{ route.contentEncoding }}</template>
                <template v-if="route.cachedAt"> cache={{ formatTime(route.cachedAt) }}</template>
              </span>
            </div>
          </k-comment>
        </template>
        <template #action="data">
          <el-button
            solid
            :type="getType(data)"
            @click.stop.prevent="active = data.package.name">
            {{ getText(data) }}
          </el-button>
        </template>
      </market-list>
    </el-scrollbar>

    <k-comment v-else type="danger" class="market-error">
      <p>无法连接到插件市场。这可能是以下原因导致的：</p>
      <p>
        Registry：{{ store.market?.registry || loadingEndpoint }}
        <template v-if="store.market?.error">；原因：{{ store.market.error }}</template>
      </p>
      <ul>
        <li>无法连接到网络，请检查你的网络连接和代理设置</li>
        <li>您所用的 registry 不支持搜索功能，请考虑进行更换</li>
      </ul>
    </k-comment>
  </k-layout>
</template>

<script setup lang="ts">

import { router, store, global, useConfig } from '@koishijs/client'
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { active } from '../utils'
import { getVisible, kConfig, MarketFilter, MarketList, MarketSearch } from '../market'
import { SearchObject } from '@koishijs/registry'

function installed(data: SearchObject) {
  if (store.packages) {
    return !!store.packages[data.package.name]
  } else {
    return !!store.dependencies?.[data.package.name]
  }
}

provide(kConfig, {
  installed: global.static ? undefined : installed,
})

const root = ref()
const config = useConfig()

const words = ref<string[]>([''])

const prompt = computed(() => words.value.filter(w => w).join(' '))

const data = computed(() => Object.values(store.market?.data || {}))

const visibleData = computed(() => getVisible(data.value, words.value))

const clientDebug = ref<{
  timings?: Record<string, number>
  total?: number
  matched?: number
  visible?: number
  rendered?: number
}>({})

const marketLoading = computed(() => !store.market || store.market.loading)
const loadingSlow = ref(false)
let loadingTimer: ReturnType<typeof setTimeout>

const loadingEndpoint = computed(() => {
  return store.market?.registry || config.value.market?.search?.endpoint || 'https://registry.koishi.t4wefan.pub/index.json'
})

const loadingTimeout = computed(() => {
  const timeout = config.value.market?.search?.timeout
  if (!timeout) return ''
  if (typeof timeout === 'number') return timeout >= 1000 ? `${Math.round(timeout / 1000)}s` : `${timeout}ms`
  return String(timeout)
})

const loadingAutoRoute = computed(() => config.value.market?.search?.autoRoute !== false)

const debugItems = computed(() => {
  const debug = store.market?.debug
  if (!debug) return []
  return [
    ['对象数', formatNumber(debug.objects ?? store.market?.total)],
    ['解压大小', formatSize(debug.size)],
    ['传输大小', formatSize(debug.wireSize)],
    ['压缩方式', formatEncoding(debug.contentEncoding)],
    ['压缩比例', formatCompressionRatio(debug.size, debug.wireSize)],
    ['候选源', formatNumber(debug.candidates)],
    ['优先源', debug.preferredEndpoint || '-'],
    ['回退原因', formatFallbackReason(debug.fallbackReason)],
    ['Hash', debug.hash || '-'],
    ['ETag', debug.etag || '-'],
    ['Last-Modified', debug.lastModified || '-'],
    ['缓存时间', debug.cachedAt ? formatTime(debug.cachedAt) : '-'],
    ['校验时间', debug.validatedAt ? formatTime(debug.validatedAt) : '-'],
    ['前端匹配', clientDebug.value.matched == null ? '-' : `${clientDebug.value.matched} / ${clientDebug.value.total ?? '-'}`],
    ['已加载/渲染', clientDebug.value.visible == null ? '-' : `${clientDebug.value.visible} / ${clientDebug.value.rendered ?? '-'}`],
  ].map(([label, value]) => ({ label, value }))
})

const debugTimings = computed(() => {
  return Object
    .entries({
      ...(store.market?.debug?.timings ?? {}),
      ...(clientDebug.value.timings ?? {}),
    })
    .filter(([, value]) => typeof value === 'number')
})

const debugPhases = computed(() => {
  const debug = store.market?.debug
  if (!debug) return []
  return [
    ['首屏', debug.initial],
    ['后台', debug.refresh],
  ].filter(([, value]) => value).map(([label, value]) => ({
    label,
    value: formatDebugPhase(value as any),
  }))
})

const debugRoutes = computed(() => store.market?.debug?.routeScores?.slice(0, 6) ?? [])

watch(router.currentRoute, (value) => {
  if (value.path !== '/market') return
  const { keyword } = value.query
  if (keyword === prompt.value) return
  words.value = Array.isArray(keyword) ? keyword : (keyword || '').split(' ')
  words.value = words.value.map(w => w.toLowerCase())
  if (words.value[words.value.length - 1]) words.value.push('')
}, { immediate: true, deep: true })

watch(prompt, (value) => {
  const { keyword: _, ...rest } = router.currentRoute.value.query
  if (value) {
    router.replace({ query: { keyword: value, ...rest } })
  } else {
    router.replace({ query: rest })
  }
}, { deep: true })

watch(marketLoading, (loading) => {
  loadingSlow.value = false
  clearTimeout(loadingTimer)
  if (loading) scheduleLoadingWarning()
}, { immediate: true })

onMounted(scheduleLoadingWarning)

onUnmounted(() => clearTimeout(loadingTimer))

function scheduleLoadingWarning() {
  clearTimeout(loadingTimer)
  if (!marketLoading.value) return
  loadingTimer = setTimeout(() => {
    if (marketLoading.value) loadingSlow.value = true
  }, 8000)
}

function getType(data: SearchObject) {
  if (global.static) return 'primary'
  const version = config.value.market?.override?.[data.package.name]
  if (installed(data)) {
    if (version === '') return 'danger'
    if (version) return 'warning'
    return 'success'
  }
  if (version) return 'warning'
  return 'primary'
}

function getText(data: SearchObject) {
  if (global.static) return '配置'
  const version = config.value.market?.override?.[data.package.name]
  if (installed(data)) {
    if (version === '') return '等待移除'
    if (version) return '等待更新'
    return '修改'
  }
  if (version) return '等待安装'
  return '添加'
}

function scrollToTop() {
  root.value?.scrollTo(0, 0)
}

function formatTime(value: number) {
  return new Date(value).toLocaleString()
}

function updateClientDebug(value: typeof clientDebug.value) {
  clientDebug.value = value
}

function formatSource(source?: string) {
  const labels: Record<string, string> = {
    'network': '网络',
    'disk-cache': '磁盘缓存',
    'http-304': 'HTTP 304',
    'hash-cache': 'Hash 命中',
    'legacy': '旧索引',
  }
  return source ? labels[source] || source : '未知'
}

function formatTimingName(name: string) {
  const labels: Record<string, string> = {
    request: '请求',
    hash: 'Hash',
    parse: 'JSON',
    apply: '索引',
    total: '总计',
    cacheRead: '读缓存',
    cacheParse: '缓存 JSON',
    payloadData: '映射',
    payload: 'Payload',
    frontendSort: '前端排序',
    frontendFilter: '前端筛选',
    frontendVirtual: '虚拟滚动',
  }
  return labels[name] || name
}

function formatDuration(value: number) {
  return `${Math.round(value)}ms`
}

function formatDebugPhase(value: {
  source?: string
  endpoint?: string
  timings?: Record<string, number>
  contentEncoding?: string
  wireSize?: number
  fallbackReason?: string
}) {
  const parts = [
    formatSource(value.source),
    shortEndpoint(value.endpoint),
  ]
  if (value.fallbackReason) parts.push(formatFallbackReason(value.fallbackReason))
  if (value.timings?.total != null) parts.push(formatDuration(value.timings.total))
  if (value.contentEncoding) parts.push(value.contentEncoding)
  if (value.wireSize) parts.push(formatSize(value.wireSize))
  return parts.filter(Boolean).join(' / ')
}

function formatFallbackReason(value?: string) {
  switch (value) {
    case 'primary-failed': return '主源失败'
    case 'primary-slow': return '主源慢'
    default: return '-'
  }
}

function formatSize(value?: number) {
  if (value == null) return '-'
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`
  if (value > 1024) return `${(value / 1024).toFixed(1)}KB`
  return `${value}B`
}

function formatEncoding(value?: string) {
  return value || 'identity'
}

function formatCompressionRatio(decoded?: number, encoded?: number) {
  if (!decoded || !encoded) return '-'
  if (encoded >= decoded) return '未压缩'
  return `${(decoded / encoded).toFixed(1)}x`
}

function shortEndpoint(value?: string) {
  if (!value) return '-'
  try {
    const url = new URL(value)
    return url.hostname
  } catch {
    return value
  }
}

function formatScore(value?: number) {
  return value == null ? '-' : value.toFixed(1)
}

function formatNumber(value?: number) {
  return value == null ? '-' : value.toLocaleString()
}

</script>

<style lang="scss">

.page-market .layout-main .el-scrollbar__view {
  padding: 0 var(--card-margin);
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.page-market .market-icon {
  display: inline-block;
  width: auto;
  height: 1em;
  max-width: 100%;
  max-height: 100%;
  flex: 0 0 auto;
  line-height: 1;
  vertical-align: -0.125em;
}

.page-market .layout-left {
  .market-filter-group {
    padding: 0 1.5rem;
    margin: 2rem 0;
  }

  h2 {
    margin: 0;
    font-size: 14px;
    padding: 8px 0;
  }
}

.search-box {
  background-color: var(--k-card-bg);
  box-shadow: var(--k-card-shadow);
  transition: var(--color-transition);
}

.market-hint {
  width: 100%;
  margin: 1rem 0 -0.5rem;
  color: var(--el-text-color-regular);
  font-size: var(--el-font-size-base);
  font-weight: var(--el-font-weight-primary);
  transition: color 0.3s ease;

  .el-checkbox {
    margin-left: 1.5rem;
  }
}

.market-stale.k-comment {
  width: 100%;
  box-sizing: border-box;
  margin: 1.25rem 0 -0.25rem;

  p {
    margin: 0.25rem 0;
  }
}

.market-loading-detail {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.market-loading-warning.k-comment {
  max-width: 640px;
  margin: 2rem auto;
  box-sizing: border-box;

  p {
    margin: 0.25rem 0;
  }
}

.market-debug.k-comment {
  width: 100%;
  box-sizing: border-box;
  margin: 1.25rem 0 -0.25rem;
  font-size: 12px;

  p {
    margin: 0.25rem 0 0.5rem;
  }
}

.market-debug-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.25rem 1rem;
}

.market-debug-item {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;

  span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg1);
  }
}

.market-debug-timings {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  margin-top: 0.5rem;
  color: var(--fg2);
}

.market-debug-routes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  margin-top: 0.5rem;
  color: var(--fg2);
}

.market-debug-route {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.market-container {
  .k-button {
    padding: 0.35em 0.85em;
    transform: translateY(-1px);
    margin-left: 1rem;
  }
}

.market-error.k-comment {
  margin-left: 2rem;
  margin-right: 2rem;
}

</style>

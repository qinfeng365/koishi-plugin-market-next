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
        <p class="el-loading-text">{{ t('marketPage.loading.title') }}</p>
        <p class="market-loading-detail">{{ t('marketPage.loading.registry', { value: loadingEndpoint }) }}</p>
      </div>
      <k-comment v-if="loadingSlow" type="warning" class="market-loading-warning">
        <p>{{ t('marketPage.loading.slow') }}</p>
        <p>
          {{ t('marketPage.loading.registry', { value: loadingEndpoint }) }}
          <template v-if="loadingTimeout"> · {{ t('marketPage.loading.timeoutLabel', { value: loadingTimeout }) }}</template>
          <template v-if="loadingAutoRoute"> · {{ t('marketPage.loading.autoRoute') }}</template>
        </p>
        <p style="margin-top: 0.5rem;">
          <el-button type="primary" size="small" @click="router.push('/settings/market')">{{ t('marketPage.loading.openMarketSettings') }}</el-button>
        </p>
      </k-comment>
    </div>

    <el-scrollbar ref="root" v-else-if="data.length">
      <div class="market-search-row">
        <market-search ref="searchBox" v-model="words"></market-search>
      </div>
      <market-secret-archive
        v-if="secretSearchMatched"
        :koishi-version="secretArchiveKoishiVersion"
        :market-count="secretArchiveMarketCount"
        :recorded-at="secretArchiveRecordedAt"
      ></market-secret-archive>
      <market-list
        v-else
        v-model="words"
        :data="visibleData"
        visibility-prepared
        :gravatar="marketGravatar"
        :debug="!!store.market.debug"
        @debug="updateClientDebug"
        @update:page="scrollToTop">
        <template #header="{ hasFilter, all, packages }">
          <div class="market-hint text-center">
            {{ hasFilter ? t('marketPage.results.filtered', { filtered: packages.length, total: all.length }) : t('marketPage.results.all', { total: all.length }) }}
          </div>
          <k-comment v-if="showMarketCacheHint && store.market.stale" type="warning" class="market-stale">
            <p>{{ t('marketPage.cache.stale') }}</p>
            <p>
              {{ t('marketPage.registry.label', { value: store.market.registry || t('marketPage.registry.unknown') }) }}
              <template v-if="store.market.error"> · {{ t('marketPage.registry.reason', { value: store.market.error }) }}</template>
            </p>
          </k-comment>
          <k-comment v-else-if="showMarketCacheHint && store.market.cached" type="warning" class="market-stale">
            <p>
              {{ t('marketPage.cache.cached') }}
              <template v-if="store.market.refreshing">{{ t('marketPage.cache.refreshing') }}</template>
            </p>
            <p>
              {{ t('marketPage.registry.label', { value: store.market.registry || t('marketPage.registry.unknown') }) }}
              <template v-if="store.market.cachedAt"> · {{ t('marketPage.cache.cachedAt', { value: formatTime(store.market.cachedAt) }) }}</template>
              <template v-if="store.market.validatedAt"> · {{ t('marketPage.cache.validatedAt', { value: formatTime(store.market.validatedAt) }) }}</template>
            </p>
          </k-comment>
          <k-comment v-if="store.market.debug" type="primary" class="market-debug">
            <p>{{ t('marketPage.debug.performance', { source: formatSource(store.market.debug.source), endpoint: store.market.debug.endpoint || store.market.registry || t('marketPage.registry.unknown') }) }}</p>
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
              <span v-for="item in debugPhases" :key="item.label">{{ item.label }}: {{ item.value }}</span>
            </div>
            <div v-if="debugRoutes.length" class="market-debug-routes">
              <span v-for="route in debugRoutes" :key="route.endpoint" class="market-debug-route">
                {{ shortEndpoint(route.endpoint) }} score={{ formatScore(route.score) }}
                <template v-if="route.averageElapsed"> avg={{ formatDuration(route.averageElapsed) }}</template>
                <template v-if="route.contentEncoding"> {{ route.contentEncoding }}</template>
                <template v-if="route.cachedAt"> cache={{ formatTime(route.cachedAt) }}</template>
                <template v-if="route.coolingDown"> cooldown={{ formatTime(route.cooldownUntil) }}</template>
              </span>
            </div>
          </k-comment>
        </template>
        <template #action="data">
          <el-button
            solid
            :type="getType(data)"
            @click.stop.prevent="openPackage(data)">
            {{ getText(data) }}
          </el-button>
        </template>
      </market-list>
    </el-scrollbar>

    <k-comment v-else type="danger" class="market-error">
      <p>{{ t('marketPage.error.title') }}</p>
      <p>
        {{ t('marketPage.error.registry', { value: store.market?.registry || loadingEndpoint }) }}
        <template v-if="store.market?.error"> · {{ t('marketPage.error.reason', { value: store.market.error }) }}</template>
      </p>
      <ul>
        <li>{{ t('marketPage.error.networkHint') }}</li>
        <li>{{ t('marketPage.error.searchHint') }}</li>
      </ul>
      <p style="margin-top: 0.8rem;">
        <el-button type="primary" size="small" @click="router.push('/settings/market')">{{ t('marketPage.error.openRegistrySettings') }}</el-button>
      </p>
    </k-comment>
  </k-layout>
</template>

<script setup lang="ts">

import { router, store, global, useConfig } from '@koishijs/client'
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { active, getMarketNextConfig, getMarketSilentFilters, getMarketSilentRules, getPendingOverrides } from '../utils'
import { getSilentFiltered, getVisible, kConfig, MarketFilter, MarketList, MarketSearch, parseSilentFilters } from '../market'
import { SearchObject } from '@koishijs/registry'
import { activeBundle } from './utils'
import MarketSecretArchive from './market-secret-archive.vue'
import { canInstallBundleSearchObject } from '../market/utils'
import {
  getMarketSnapshotData,
  loadMarketSnapshot,
  marketSnapshot,
  marketSnapshotError,
  marketSnapshotLoading,
} from '../market/state'
import { useMarketNextI18n } from '../i18n'

function installed(data: SearchObject) {
  if (store.packages) {
    return !!store.packages[data.package.name]
  } else {
    return !!store.dependencies?.[data.package.name]
  }
}

const root = ref()
const searchBox = ref<{ focus?: () => void }>()
const config = useConfig()
const { t, locale } = useMarketNextI18n()
const marketGravatar = computed(() => config.value.market?.gravatar || store.market?.gravatar)
const silentFilters = computed(() => {
  const rules = getMarketSilentRules(config.value)
  if (rules.length) return rules
  return parseSilentFilters(getMarketSilentFilters(config.value))
})

provide(kConfig, {
  installed: global.static ? undefined : installed,
})

const words = ref<string[]>([''])

const prompt = computed(() => words.value.filter(w => w).join(' '))

const secretSearchMatched = computed(() => {
  const source = words.value.join('').normalize('NFKC')
  const prefixIndex = source.indexOf('恋恋')
  return prefixIndex >= 0 && source.indexOf('世界第一', prefixIndex + 2) >= 0
})

const secretArchiveRecordedAt = ref('')

const secretArchiveKoishiVersion = computed(() => {
  return store.dependencies?.koishi?.resolved
    || store.packages?.koishi?.package.version
    || store.dependencies?.['@koishijs/core']?.resolved
    || store.packages?.['@koishijs/core']?.package.version
})

watch(secretSearchMatched, (matched) => {
  if (!matched) return
  secretArchiveRecordedAt.value = new Date().toLocaleString(locale.value)
  requestAnimationFrame(() => root.value?.scrollTo(0, 0))
})

const data = computed(() => Object.values(getMarketSnapshotData()))

const secretArchiveMarketCount = computed(() => store.market?.total || data.value.length)

const silentData = computed(() => getSilentFiltered(data.value, silentFilters.value, {
  installed: global.static ? undefined : installed,
}))

const visibilityMode = computed(() => {
  return `${words.value.includes('show:hidden') ? 1 : 0}:${words.value.includes('show:deprecated') ? 1 : 0}`
})

const visibleData = computed(() => {
  const [hidden, deprecated] = visibilityMode.value.split(':')
  const visibilityWords = [
    hidden === '1' ? 'show:hidden' : '',
    deprecated === '1' ? 'show:deprecated' : '',
  ].filter(Boolean)
  return getVisible(silentData.value, visibilityWords)
})

const clientDebug = ref<{
  timings?: Record<string, number>
  total?: number
  matched?: number
  visible?: number
  rendered?: number
}>({})

const marketLoading = computed(() => {
  if (data.value.length) return false
  if (marketSnapshotError.value) return false
  if (marketSnapshotLoading.value) return true
  const state = marketSnapshot.value ?? store.market
  if (!state || state.loading) return true
  const hasResolvedSnapshot = !!marketSnapshot.value || !!store.market?.data
  return !hasResolvedSnapshot && (state.total ?? 0) > 0
})
const loadingSlow = ref(false)
let loadingTimer: ReturnType<typeof setTimeout>

const loadingEndpoint = computed(() => {
  return store.market?.registry || getMarketNextConfig()?.search?.endpoint || 'https://registry.koishi.t4wefan.pub/index.json'
})

const loadingTimeout = computed(() => {
  const seconds = getMarketNextConfig()?.search?.timeoutSeconds
  return seconds ? `${seconds}s` : ''
})

const loadingAutoRoute = computed(() => getMarketNextConfig()?.search?.autoRoute !== false)

const showMarketCacheHint = computed(() => getMarketNextConfig()?.logLevel !== 'silent')

const debugItems = computed(() => {
  const debug = store.market?.debug
  if (!debug) return []
  return [
    [t('marketPage.debug.objectCount'), formatNumber(debug.objects ?? store.market?.total)],
    [t('marketPage.debug.decodedSize'), formatSize(debug.size)],
    [t('marketPage.debug.wireSize'), formatSize(debug.wireSize)],
    [t('marketPage.debug.encoding'), formatEncoding(debug.contentEncoding)],
    [t('marketPage.debug.compressionRatio'), formatCompressionRatio(debug.size, debug.wireSize)],
    [t('marketPage.debug.candidates'), formatNumber(debug.candidates)],
    [t('marketPage.debug.preferredEndpoint'), debug.preferredEndpoint || '-'],
    [t('marketPage.debug.fallbackReason'), formatFallbackReason(debug.fallbackReason)],
    ['Hash', debug.hash || '-'],
    ['ETag', debug.etag || '-'],
    ['Last-Modified', debug.lastModified || '-'],
    [t('marketPage.debug.cacheTime'), debug.cachedAt ? formatTime(debug.cachedAt) : '-'],
    [t('marketPage.debug.validationTime'), debug.validatedAt ? formatTime(debug.validatedAt) : '-'],
    [t('marketPage.debug.frontendMatched'), clientDebug.value.matched == null ? '-' : `${clientDebug.value.matched} / ${clientDebug.value.total ?? '-'}`],
    [t('marketPage.debug.loadedRendered'), clientDebug.value.visible == null ? '-' : `${clientDebug.value.visible} / ${clientDebug.value.rendered ?? '-'}`],
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
    [t('marketPage.debug.initial'), debug.initial],
    [t('marketPage.debug.background'), debug.refresh],
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

let routeSyncTimer: ReturnType<typeof setTimeout>

watch(prompt, (value) => {
  clearTimeout(routeSyncTimer)
  routeSyncTimer = setTimeout(() => {
    const { keyword: _, ...rest } = router.currentRoute.value.query
    if (value === (router.currentRoute.value.query.keyword || '')) return
    if (value) {
      router.replace({ query: { keyword: value, ...rest } })
    } else {
      router.replace({ query: rest })
    }
  }, 180)
}, { deep: true })

watch(marketLoading, (loading) => {
  loadingSlow.value = false
  clearTimeout(loadingTimer)
  if (loading) scheduleLoadingWarning()
}, { immediate: true })

watch(() => store.market?.dataVersion, (version, previous) => {
  if (version == null || version === previous) return
  void loadMarketSnapshot().catch(error => console.error('[market-next] failed to refresh market index', error))
})

onMounted(() => {
  scheduleLoadingWarning()
  window.addEventListener('keydown', onSearchShortcut)
  void loadMarketSnapshot().catch(error => console.error('[market-next] failed to load market index', error))
})

onUnmounted(() => {
  clearTimeout(loadingTimer)
  clearTimeout(routeSyncTimer)
  window.removeEventListener('keydown', onSearchShortcut)
})

function onSearchShortcut(event: KeyboardEvent) {
  if (router.currentRoute.value?.path !== '/market') return
  if (event.key === 'Escape' && secretSearchMatched.value) {
    event.preventDefault()
    words.value = ['']
    searchBox.value?.focus?.()
    return
  }
  if (event.key.toLowerCase() !== 'k') return
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  searchBox.value?.focus?.()
}

function scheduleLoadingWarning() {
  clearTimeout(loadingTimer)
  if (!marketLoading.value) return
  loadingTimer = setTimeout(() => {
    if (marketLoading.value) loadingSlow.value = true
  }, 8000)
}

function getType(data: SearchObject) {
  if (global.static) return 'primary'
  const version = getPendingOverrides()[data.package.name]
  if (installed(data)) {
    if (version === '') return 'danger'
    if (version) return 'warning'
    return 'success'
  }
  if (version) return 'warning'
  return 'primary'
}

function getText(data: SearchObject) {
  if (global.static) return t('marketPage.actions.config')
  const version = getPendingOverrides()[data.package.name]
  if (installed(data)) {
    if (version === '') return t('marketPage.actions.waitingRemove')
    if (version) return t('marketPage.actions.waitingUpdate')
    return t('marketPage.actions.edit')
  }
  if (version) return t('marketPage.actions.waitingInstall')
  return t('marketPage.actions.addPlugin')
}

function openPackage(data: SearchObject) {
  if (!global.static && canInstallBundleSearchObject(data)) {
    activeBundle.value = data
    return
  }
  active.value = data.package.name
}

function scrollToTop() {
  root.value?.scrollTo(0, 0)
}

function formatTime(value: number) {
  return new Date(value).toLocaleString(locale.value)
}

function updateClientDebug(value: typeof clientDebug.value) {
  clientDebug.value = value
}

function formatSource(source?: string) {
  const labels: Record<string, string> = {
    'network': t('marketPage.debug.sourceNetwork'),
    'disk-cache': t('marketPage.debug.sourceDiskCache'),
    'http-304': t('marketPage.debug.sourceHttp304'),
    'hash-cache': t('marketPage.debug.sourceHashCache'),
    'legacy': t('marketPage.debug.sourceLegacy'),
  }
  return source ? labels[source] || source : t('marketPage.debug.unknown')
}

function formatTimingName(name: string) {
  const labels: Record<string, string> = {
    request: t('marketPage.debug.request'),
    version: t('marketPage.debug.versionProbe'),
    hash: 'Hash',
    parse: t('marketPage.debug.parse'),
    apply: t('marketPage.debug.apply'),
    total: t('marketPage.debug.total'),
    cacheRead: t('marketPage.debug.cacheRead'),
    cacheParse: t('marketPage.debug.cacheParse'),
    payloadData: t('marketPage.debug.payloadData'),
    payload: t('marketPage.debug.payload'),
    frontendSort: t('marketPage.debug.frontendSort'),
    frontendFilter: t('marketPage.debug.frontendFilter'),
    frontendVirtual: t('marketPage.debug.frontendVirtual'),
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
    case 'primary-failed': return t('marketPage.debug.primaryFailed')
    case 'primary-slow': return t('marketPage.debug.primarySlow')
    case 'primary-stale': return t('marketPage.debug.primaryStale')
    case 'rescue': return t('marketPage.debug.rescue')
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
  if (encoded >= decoded) return t('marketPage.debug.uncompressed')
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
    padding: 0 1rem;
    margin: 1.5rem 0;
  }

  h2 {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 6px 0.5rem;
    color: var(--el-text-color-secondary);
    opacity: 0.7;
  }
}

.search-box {
  background-color: var(--k-card-bg);
  transition: var(--color-transition);
}

.market-hint {
  width: 100%;
  margin: 1rem 0 0.75rem;
  color: var(--el-text-color-regular);
  font-size: var(--el-font-size-base);
  font-weight: var(--el-font-weight-primary);
  line-height: 1.5;
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

.market-search-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  max-width: 48rem;
  margin: var(--card-margin) auto 0;

  .search-box {
    flex: 1 1 auto;
    max-width: none;
    margin: 0;
  }
}

</style>

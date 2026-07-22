<template>
  <k-layout main="darker" :class="['page-market', modeClass]" menu="market">
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
import { active, getFrontendMode, getMarketSilentFilters, getMarketSilentRules, getPendingOverrides } from '../utils'
import { getSilentFiltered, getVisible, kConfig, MarketFilter, MarketList, MarketSearch, parseSilentFilters } from '../market'
import { SearchObject } from '@koishijs/registry'
import { activeBundle } from './utils'
import MarketSecretArchive from './market-secret-archive.vue'
import { canInstallBundleSearchObject } from '../market/utils'
import {
  getMarketSnapshotData,
  loadMarketSnapshot,
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
const frontendMode = computed(() => getFrontendMode(config.value))
const marketGravatar = computed(() => config.value.market?.gravatar || store.market?.gravatar)
const silentFilters = computed(() => {
  const rules = getMarketSilentRules(config.value)
  if (rules.length) return rules
  return parseSilentFilters(getMarketSilentFilters(config.value))
})
const modeClass = computed(() => `market-mode-${frontendMode.value}`)

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
  if (!store.market || store.market.loading || marketSnapshotLoading.value) return true
  return store.market.total > 0 && !data.value.length && !marketSnapshotError.value
})
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

const showMarketCacheHint = computed(() => config.value.market?.search?.logLevel !== 'silent')

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
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
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

.page-market.market-mode-polished {
  --market-polished-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --market-polished-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --market-polished-shadow: 0 4px 12px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  --market-polished-shadow-glow: 0 20px 38px rgba(0, 0, 0, 0.15), 0 6px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.15);
  --market-polished-glass: color-mix(in srgb, var(--k-card-bg) 45%, transparent);
  --market-polished-glass-hover: color-mix(in srgb, var(--k-card-bg) 60%, transparent);
  --market-polished-line: color-mix(in srgb, var(--k-color-primary) 12%, var(--k-color-border));

  .layout-left {
    position: relative;
    z-index: 2;
    border-right-color: color-mix(in srgb, var(--k-color-primary) 14%, var(--k-color-border));
    background: color-mix(in srgb, var(--k-side-bg) 35%, transparent) !important;
    backdrop-filter: blur(12px) saturate(110%) !important;

    h2 {
      background: linear-gradient(90deg, var(--k-color-primary), color-mix(in srgb, var(--k-color-primary) 55%, var(--el-text-color-secondary)));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      opacity: 1;
    }
  }

  .layout-main {
    position: relative;
    z-index: 1;
    background-color: var(--k-page-bg, var(--k-bg-darker)) !important;
    background-image: radial-gradient(color-mix(in srgb, var(--fg1) 8%, transparent) 1.2px, transparent 1.2px) !important;
    background-size: 24px 24px !important;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      inset: -10%;
      background:
        radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--k-color-primary) 22%, transparent) 0%, transparent 50%),
        radial-gradient(circle at 80% 80%, color-mix(in srgb, var(--k-color-success) 18%, transparent) 0%, transparent 50%),
        radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--k-color-warning) 12%, transparent) 0%, transparent 45%);
      pointer-events: none;
      z-index: 0;
      opacity: 0.75;
      animation: polished-bg-drift 32s infinite alternate ease-in-out;
      will-change: transform;
    }
  }

  .layout-main .el-scrollbar__view {
    position: relative;
    z-index: 2;
    animation: market-polished-enter 0.5s var(--market-polished-ease) both;
  }

  // stagger cards on initial render only — settled class added after 700ms to stop re-animating during scroll
  .package-list:not(.settled) .market-package {
    @for $i from 1 through 12 {
      &:nth-child(#{$i}) {
        animation: market-polished-card-enter 0.55s var(--market-polished-ease) #{($i - 1) * 0.045}s both;
      }
    }

    &:nth-child(n + 13) {
      animation: market-polished-card-enter 0.55s var(--market-polished-ease) 0.5s both;
    }
  }

  .search-box {
    border-color: var(--market-polished-line);
    background: var(--market-polished-glass);
    box-shadow: var(--market-polished-shadow);
    backdrop-filter: blur(12px) saturate(120%);
    transition:
      border-color 0.3s var(--market-polished-ease),
      box-shadow 0.3s var(--market-polished-ease),
      transform 0.4s var(--market-polished-ease-spring);

    &:focus-within {
      border-color: color-mix(in srgb, var(--k-color-primary) 50%, var(--k-color-border));
      background: var(--market-polished-glass-hover);
      box-shadow:
        0 12px 28px rgba(0, 0, 0, 0.12),
        0 0 0 3px color-mix(in srgb, var(--k-color-primary) 15%, transparent),
        inset 0 1px 0 rgba(255, 255, 255, 0.15);
      transform: translateY(-2px);
    }
  }

  .market-hint {
    opacity: 0.8;
  }

  .market-stale.k-comment,
  .market-debug.k-comment,
  .market-loading-warning.k-comment,
  .market-error.k-comment {
    border-color: color-mix(in srgb, var(--k-color-primary) 16%, var(--k-color-border));
    background: var(--market-polished-glass);
    box-shadow: var(--market-polished-shadow);
    backdrop-filter: blur(10px) saturate(110%);
  }

  // scrollbar
  .el-scrollbar__bar.is-vertical .el-scrollbar__thumb {
    background: color-mix(in srgb, var(--k-color-primary) 28%, var(--el-scrollbar-bg-color, rgba(144, 147, 153, 0.3)));
    border-radius: 4px;
    transition: background 0.2s var(--market-polished-ease);

    &:hover { background: color-mix(in srgb, var(--k-color-primary) 55%, var(--el-scrollbar-hover-bg-color, rgba(144, 147, 153, 0.5))); }
  }

  // sidebar filter items
  :deep(.market-filter-item) {
    border-radius: 8px;
    transition: color 0.18s var(--market-polished-ease), background 0.18s var(--market-polished-ease), transform 0.25s var(--market-polished-ease-spring), box-shadow 0.18s var(--market-polished-ease);

    &:hover {
      background: color-mix(in srgb, var(--k-color-primary) 7%, var(--k-hover-bg, rgba(128, 128, 128, 0.08)));
      transform: translateX(3px);
    }

    &.active {
      background: color-mix(in srgb, var(--k-color-primary) 14%, transparent);
      box-shadow: inset 3px 0 0 var(--k-color-primary), inset 0 1px 0 rgb(255 255 255 / 6%);
      transform: translateX(3px);
    }

    &.active.verified, &.active.newborn { box-shadow: inset 3px 0 0 var(--k-color-success); }
    &.active.preview, &.active.portable { box-shadow: inset 3px 0 0 var(--k-color-warning); }
    &.active.insecure { box-shadow: inset 3px 0 0 var(--k-color-danger); }
  }

  :deep(.market-date-row) {
    span {
      color: var(--fg2);
      opacity: 0.9;
    }

    input {
      border-color: color-mix(in srgb, var(--k-color-primary) 14%, var(--k-color-border));
      background: color-mix(in srgb, var(--k-card-bg) 62%, transparent);
      box-shadow: inset 0 1px 0 rgb(255 255 255 / 5%);

      &:hover,
      &:focus {
        border-color: color-mix(in srgb, var(--k-color-primary) 42%, var(--k-color-border));
        background: color-mix(in srgb, var(--k-card-bg) 78%, transparent);
      }
    }
  }

  :deep(.market-date-clear) {
    border-color: color-mix(in srgb, var(--k-color-primary) 16%, var(--k-color-border));
    background: color-mix(in srgb, var(--k-card-bg) 56%, transparent);

    &:hover {
      box-shadow: inset 3px 0 0 var(--k-color-primary);
    }
  }

  // load-complete footer
  .load-complete {
    opacity: 0.55;
    font-size: 12px;
    letter-spacing: 0.04em;
    position: relative;

    &::before, &::after {
      content: '';
      position: absolute;
      top: 50%;
      width: 4rem;
      height: 1px;
      background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--k-color-border) 60%, transparent));
    }
    &::before { right: calc(50% + 5rem); transform: rotate(180deg); }
    &::after { left: calc(50% + 5rem); }
  }

  .market-package {
    border-color: color-mix(in srgb, var(--k-color-border) 70%, transparent);
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.01) 100%),
      var(--market-polished-glass) !important;
    background-color: transparent !important;
    box-shadow: var(--market-polished-shadow);
    backdrop-filter: blur(16px) saturate(140%);
    transition:
      transform 0.4s var(--market-polished-ease-spring),
      box-shadow 0.4s var(--market-polished-ease),
      border-color 0.3s var(--market-polished-ease),
      background 0.3s var(--market-polished-ease);
    will-change: transform, box-shadow;

    &::before {
      content: '';
      position: absolute;
      inset: -12px;
      border-radius: 24px;
      background: radial-gradient(circle at center, color-mix(in srgb, var(--c, var(--k-color-primary)) 22%, transparent), transparent 70%);
      z-index: -1;
      opacity: 0;
      filter: blur(20px);
      transition: opacity 0.4s var(--market-polished-ease);
      pointer-events: none;
    }

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      border: 1px solid transparent;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), transparent 40%) border-box;
      -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: destination-out;
      mask-composite: exclude;
      pointer-events: none;
      transition: opacity 0.3s var(--market-polished-ease);
    }

    &:hover {
      border-color: color-mix(in srgb, var(--c, var(--k-color-primary)) 45%, var(--k-color-border));
      box-shadow: var(--market-polished-shadow-glow);
      background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%),
        var(--market-polished-glass-hover);
      transform: translateY(-4px) scale(1.012);

      &::before {
        opacity: 1;
      }

      .header .left {
        transform: translateY(-2px) scale(1.08) rotate(-1deg);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.15),
          0 8px 18px color-mix(in srgb, var(--c) 25%, transparent);
        border-color: color-mix(in srgb, var(--c) 45%, var(--k-color-border));
      }

      .title {
        color: var(--c, var(--k-color-primary));
        text-shadow: 0 0 12px color-mix(in srgb, var(--c, var(--k-color-primary)) 20%, transparent);
      }
    }

    .header .left {
      position: relative;
      overflow: hidden;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 4px 10px color-mix(in srgb, var(--c) 12%, transparent);
      transition:
        transform 0.4s var(--market-polished-ease-spring),
        box-shadow 0.4s var(--market-polished-ease),
        border-color 0.3s var(--market-polished-ease);

      &::after {
        content: '';
        position: absolute;
        inset: -30% -70%;
        background: linear-gradient(115deg, transparent 40%, color-mix(in srgb, var(--c) 24%, transparent) 50%, transparent 62%);
        opacity: 0.3;
        transform: translateX(-18%);
        transition: transform 0.5s var(--market-polished-ease), opacity 0.3s var(--market-polished-ease);
        pointer-events: none;
      }
    }

    h2 .icon {
      border-color: color-mix(in srgb, currentColor 20%, transparent);
      background: color-mix(in srgb, currentColor 8%, var(--k-card-bg));
      box-shadow: inset 0 1px 0 rgb(255 255 255 / 5%);
    }

    .desc {
      color: var(--k-text-light, var(--fg2));
    }

    .updated-meta {
      color: color-mix(in srgb, var(--c, var(--k-color-primary)) 62%, var(--k-text-light));

      .market-icon {
        filter: drop-shadow(0 1px var(--update-heart-glow-size, 0) var(--update-heart-glow-color, transparent));
      }
    }

    .footer {
      border-top: 1px solid color-mix(in srgb, var(--k-color-border) 40%, transparent);
      padding-top: 0.5rem;
      margin-top: -0.25rem;
      height: 2rem;
      overflow: visible;
      color: var(--k-text-light, var(--fg2));
    }

    .avatars img {
      box-shadow: 0 1px 4px rgb(0 0 0 / 12%), 0 0 0 1px color-mix(in srgb, var(--k-color-primary) 14%, var(--k-color-border));
      transition: transform 0.25s var(--market-polished-ease-spring), box-shadow 0.2s var(--market-polished-ease);

      &:hover {
        transform: translateY(-2px) scale(1.1);
        box-shadow: 0 3px 8px rgb(0 0 0 / 15%), 0 0 0 1.5px color-mix(in srgb, var(--k-color-primary) 28%, transparent);
      }
    }

  }
}

@keyframes market-polished-enter {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes polished-bg-drift {
  0% {
    transform: translate(0, 0) scale(1) rotate(0deg);
  }
  50% {
    transform: translate(4%, 5%) scale(1.02) rotate(2deg);
  }
  100% {
    transform: translate(-3%, -4%) scale(0.98) rotate(-2deg);
  }
}

@keyframes market-polished-card-enter {
  from {
    opacity: 0;
    transform: translateY(32px) scale(0.94);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-market.market-mode-polished {
    .layout-main .el-scrollbar__view,
    .package-list .market-package {
      animation: none;
    }

    .search-box,
    .market-package {
      transition: border-color 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;

      &:hover,
      &:focus-within {
        transform: none;
      }
    }
  }
}

@media screen and (max-width: 768px) {
  .page-market.market-mode-polished {
    .layout-left {
      z-index: 0;
      background: var(--k-side-bg) !important;
      backdrop-filter: none !important;
      box-shadow: 8px 0 24px rgb(0 0 0 / 18%);
    }

    .main-container {
      z-index: 1;
      background: var(--k-page-bg, var(--k-bg-darker));
    }

    &:not(.is-left-aside-open) .layout-left {
      pointer-events: none;
    }

    &.is-left-aside-open .layout-left {
      z-index: 2;
    }
  }
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

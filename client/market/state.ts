import { receive, send, store } from '@koishijs/client'
import { markRaw, ref, shallowRef } from 'vue'
import type { MarketLookupRequest, MarketLookupResult, MarketProvider } from '../../src/shared'

export type MarketSnapshot = MarketProvider.Payload & {
  data: NonNullable<MarketProvider.Payload['data']>
}

export const marketSnapshot = shallowRef<MarketSnapshot>()
export const marketSnapshotLoading = ref(false)
export const marketSnapshotError = ref<unknown>()
export const marketLookupData = shallowRef<MarketSnapshot['data']>({})
export const marketLookupServices = shallowRef<Record<string, string[]>>({})

let snapshotTask: Promise<MarketSnapshot> | undefined
let snapshotTaskKey = ''
let snapshotKey = ''
let lookupDataVersion: number | undefined
let lookupGeneration = 0
const lookupTasks = new Map<string, Promise<void>>()
const missingMarketObjects = new Set<string>()
const requestedMarketObjects = new Set<string>()
const requestedMarketServices = new Set<string>()
const snapshotSuperseded = new Error('market snapshot superseded')

function getSummaryKey(value: Partial<MarketProvider.Payload> | undefined) {
  if (!value) return ''
  return [
    value.dataVersion ?? 0,
    value.debug?.hash ?? '',
  ].join(':')
}

function publishSnapshot(value: MarketProvider.Payload): MarketSnapshot {
  const data = markRaw(value.data ?? {})
  const snapshot = markRaw({ ...value, data }) as MarketSnapshot
  marketSnapshot.value = snapshot
  snapshotKey = getSummaryKey(snapshot)
  marketSnapshotError.value = undefined

  // Keep legacy consumers working without making the nested index reactive.
  if (store.market) {
    store.market = {
      ...store.market,
      ...snapshot,
      data,
    }
  }
  return snapshot
}

export function getMarketSnapshotData() {
  return marketSnapshot.value?.data ?? store.market?.data ?? {}
}

export function getMarketObject(name: string) {
  return marketLookupData.value[name] ?? getCurrentSnapshotData()?.[name]
}

export function getMarketServiceProviders(name: string) {
  return marketLookupServices.value[name] ?? []
}

export function restoreMarketSnapshot() {
  if (!store.market || store.market.data || !marketSnapshot.value) return
  store.market = {
    ...store.market,
    data: marketSnapshot.value.data,
  }
}

export async function loadMarketSnapshot(force = false) {
  const key = getSummaryKey(store.market)
  if (!force && !marketSnapshot.value && store.market?.data) {
    return publishSnapshot(store.market)
  }
  if (!force && marketSnapshot.value && key && key === snapshotKey) {
    return marketSnapshot.value
  }
  if (snapshotTask) {
    if (!force && (!key || key === snapshotTaskKey)) return snapshotTask
    await snapshotTask.catch(() => undefined)
    return loadMarketSnapshot(force)
  }

  marketSnapshotLoading.value = true
  snapshotTaskKey = key
  const task = (async () => {
    const value = await (send('market/index' as any) as Promise<MarketProvider.Payload> | undefined)
    if (!value) throw new Error('market index request is unavailable')
    const currentVersion = store.market?.dataVersion
    const currentKey = getSummaryKey(store.market)
    const responseKey = getSummaryKey(value)
    if (currentVersion != null && value.dataVersion != null && currentVersion > value.dataVersion) {
      throw snapshotSuperseded
    }
    if (key && currentKey && currentKey !== key && responseKey !== currentKey) {
      throw snapshotSuperseded
    }
    return publishSnapshot(value)
  })()
    .catch((error) => {
      if (error !== snapshotSuperseded) marketSnapshotError.value = error
      throw error
    })
    .finally(() => {
      if (snapshotTask === task) snapshotTask = undefined
      if (snapshotTaskKey === key) snapshotTaskKey = ''
      marketSnapshotLoading.value = false
    }) as Promise<MarketSnapshot>

  snapshotTask = task
  try {
    return await task
  } catch (error) {
    if (error === snapshotSuperseded) return loadMarketSnapshot(true)
    throw error
  }
}

export function loadMarketObjects(names: Iterable<string>) {
  const normalized = normalizeLookupValues(names)
  for (const name of normalized) requestedMarketObjects.add(name)
  return loadMarketLookup({ names: normalized })
}

export function loadMarketServiceProviders(names: Iterable<string>) {
  const normalized = normalizeLookupValues(names)
  for (const name of normalized) requestedMarketServices.add(name)
  return loadMarketLookup({ services: normalized })
}

export async function refreshMarketLookups() {
  lookupGeneration++
  lookupTasks.clear()
  lookupDataVersion = undefined
  missingMarketObjects.clear()
  marketLookupData.value = {}
  marketLookupServices.value = {}
  const names = Array.from(requestedMarketObjects)
  const services = Array.from(requestedMarketServices)
  if (!names.length && !services.length) return
  await loadMarketLookup({ names, services }, true)
}

function getCurrentSnapshotData() {
  const snapshot = marketSnapshot.value
  const currentVersion = store.market?.dataVersion
  if (snapshot && (currentVersion == null || snapshot.dataVersion == null || snapshot.dataVersion === currentVersion)) {
    return snapshot.data
  }
  if (!snapshot && store.market?.data) return store.market.data
}

function normalizeLookupValues(values: Iterable<string>) {
  return Array.from(new Set(Array.from(values)
    .filter(value => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean)))
}

function collectServiceProviders(data: MarketSnapshot['data'], services: string[]) {
  const result = Object.fromEntries(services.map(name => [name, [] as string[]]))
  const requested = new Set(services)
  for (const object of Object.values(data)) {
    const implemented = object?.manifest?.service?.implements
    if (!Array.isArray(implemented)) continue
    for (const service of implemented) {
      if (requested.has(service)) result[service].push(object.package.name)
    }
  }
  for (const service of services) result[service].sort()
  return result
}

async function loadMarketLookup(request: MarketLookupRequest, force = false) {
  const names = normalizeLookupValues(request.names ?? [])
  const services = normalizeLookupValues(request.services ?? [])
  if (!names.length && !services.length) return

  const fullData = getCurrentSnapshotData()
  if (fullData && !force) {
    for (const name of names) {
      if (!fullData[name]) missingMarketObjects.add(name)
    }
    if (services.length) {
      marketLookupServices.value = {
        ...marketLookupServices.value,
        ...collectServiceProviders(fullData, services),
      }
    }
    return
  }

  const currentVersion = store.market?.dataVersion
  const lookupCurrent = currentVersion == null || lookupDataVersion == null || lookupDataVersion === currentVersion
  const pendingNames = force ? names : names.filter(name => {
    if (fullData?.[name]) return false
    if (lookupCurrent && (marketLookupData.value[name] || missingMarketObjects.has(name))) return false
    return true
  })
  const pendingServices = force ? services : services.filter(name => {
    return !Object.prototype.hasOwnProperty.call(marketLookupServices.value, name)
  })
  if (!pendingNames.length && !pendingServices.length) return

  const key = JSON.stringify([pendingNames.slice().sort(), pendingServices.slice().sort(), force])
  if (lookupTasks.has(key)) return lookupTasks.get(key)
  const generation = lookupGeneration
  let superseded = false
  const task = (async () => {
    const response = await send('market/lookup', {
      names: pendingNames,
      services: pendingServices,
    }) as MarketLookupResult | undefined
    if (!response || generation !== lookupGeneration) return
    const latestVersion = store.market?.dataVersion
    if (latestVersion != null && response.dataVersion != null && latestVersion > response.dataVersion) {
      superseded = true
      return
    }
    lookupDataVersion = response.dataVersion
    for (const name of pendingNames) {
      if (!response.data[name]) missingMarketObjects.add(name)
    }
    marketLookupData.value = markRaw({
      ...marketLookupData.value,
      ...response.data,
    })
    marketLookupServices.value = {
      ...marketLookupServices.value,
      ...response.services,
    }
  })().finally(() => {
    if (lookupTasks.get(key) === task) lookupTasks.delete(key)
  })
  lookupTasks.set(key, task)
  await task
  if (superseded) return loadMarketLookup({ names: pendingNames, services: pendingServices }, true)
}

receive('market/patch', (value: Partial<MarketProvider.Payload>) => {
  if (!marketSnapshot.value || !value.data) return
  publishSnapshot({
    ...marketSnapshot.value,
    ...value,
    data: {
      ...marketSnapshot.value.data,
      ...value.data,
    },
  })
})

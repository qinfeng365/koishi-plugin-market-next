import { Dict, receive, store } from '@koishijs/client'
import type { PluginBundleRecord, RegistryStatus } from 'koishi-plugin-market-next'
import type { DependencySource } from '../src/shared/dependency-source'
import type { IgnoredUpdates } from './utils'
import { translate } from './i18n'

declare module '@koishijs/client' {
  interface Config {
    market: MarketConfig
  }
  interface Store {
    marketData?: {
      override?: Dict<string>
      updateIgnored?: IgnoredUpdates
      bundleRecords?: Dict<PluginBundleRecord>
      collapsedGroups?: Dict<boolean>
    }
    dependencies?: Dict<{
      request: string
      resolved?: string
      workspace?: boolean
      source?: DependencySource
      local?: boolean
      bound?: boolean
      invalid?: boolean
      latest?: string
    }>
  }
}

interface MarketConfig {
  bulkMode?: boolean
  removeConfig?: boolean
  updateIgnoredPackages?: string
  updateIgnoreDuration?: number
  updateIgnoreVersions?: number
  updateIgnorePrerelease?: boolean
  gravatar?: string
  search?: {
    endpoint?: string
    timeout?: number
    autoRoute?: boolean
    logLevel?: string
  }
}

export type MarketStore = typeof store & {
  registryStatus?: Dict<RegistryStatus>
}

export const REGISTRY_STATUS_SWEEP_INTERVAL = 15_000
const REGISTRY_STATUS_TIMEOUT = 120_000

export function sweepRegistryStatus(target: MarketStore = store as MarketStore) {
  const now = Date.now()
  const next = { ...target.registryStatus }
  let changed = false
  for (const [name, status] of Object.entries(next)) {
    if (!status?.loading) continue
    if (status.updatedAt && now - status.updatedAt <= REGISTRY_STATUS_TIMEOUT) continue
    next[name] = {
      ...status,
      loading: false,
      reason: 'timeout',
      error: translate('common.messages.metadataTimeout'),
    }
    changed = true
  }
  if (changed) target.registryStatus = next
  return changed
}

receive('market/registry', (data) => {
  store.registry = {
    ...store.registry,
    ...data,
  }
})

receive('market/registry-status', (data: Dict<RegistryStatus>) => {
  const target = store as MarketStore
  const next = { ...target.registryStatus }
  for (const [name, status] of Object.entries(data)) {
    if (!status) continue
    next[name] = status
  }
  target.registryStatus = {
    ...next,
  }
  sweepRegistryStatus(target)
})

receive('market/registry-status/clear', () => {
  const target = store as MarketStore
  target.registryStatus = {}
})

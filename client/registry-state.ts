import { Dict, store } from '@koishijs/client'
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
    pluginConfigs?: string[]
  }
}

interface MarketConfig {
  removeConfig?: boolean
  updateIgnoredPackages?: string
  updateIgnoreDays?: number
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
  // Null for a dependency whose fetch a reset cancelled, until the check fetches it again.
  registryStatus?: Dict<RegistryStatus | null>
}

export function isRegistryRefreshing() {
  return Object.values((store as MarketStore).registryStatus ?? {}).some(status => status?.loading)
}

export const REGISTRY_STATUS_SWEEP_INTERVAL = 15_000
const REGISTRY_STATUS_TIMEOUT = 120_000

export function sweepRegistryStatus() {
  const target = store as MarketStore
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

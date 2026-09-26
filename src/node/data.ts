import { Context, Dict } from 'koishi'
import { DataService } from '@koishijs/console'
import { dirname, resolve } from 'path'
import { promises as fsp } from 'fs'
import { randomUUID } from 'crypto'
import type { PluginBundleRecord } from '../shared/bundle'
import type { UpdateIgnoreRule } from '../shared/update'
import { logger } from './logger'

export type { UpdateIgnoreRule } from '../shared/update'

const COLLAPSED_GROUPS_VERSION = 1

export interface MarketDataStorePayload {
  override: Dict<string>
  updateIgnored: Dict<string | UpdateIgnoreRule>
  bundleRecords: Dict<PluginBundleRecord>
  collapsedGroups: Dict<boolean>
}

const emptyStore = (): MarketDataStorePayload => ({
  override: {},
  updateIgnored: {},
  bundleRecords: {},
  collapsedGroups: {},
})

export async function readMarketDataStore(ctx: Context): Promise<MarketDataStorePayload> {
  const file = resolve(ctx.baseDir, 'data', 'market-next.json')
  try {
    return normalizeStore(JSON.parse(await fsp.readFile(file, 'utf8')))
  } catch (error) {
    if ((error as any)?.code !== 'ENOENT') {
      logger.warn(`failed to read market-next data store: ${error instanceof Error ? error.message : error}`)
    }
    return emptyStore()
  }
}

export class MarketDataStore extends DataService<MarketDataStorePayload> {
  private file: string
  private data = emptyStore()
  private ready?: Promise<void>
  private mutationTask: Promise<void> = Promise.resolve()
  private hasCollapsedGroupsState = false
  private collapsedGroupsVersion = 0

  constructor(public ctx: Context) {
    super(ctx, 'marketData', { immediate: true, authority: 4 })
    this.file = resolve(ctx.baseDir, 'data', 'market-next.json')
    this.ready = this.load()
  }

  async get() {
    await this.ready
    await this.mutationTask
    return this.snapshot()
  }

  async patch(patch: Partial<MarketDataStorePayload>) {
    await this.ready
    return this.queueMutation(async () => {
      const previous = this.data
      const previousCollapsedState = this.hasCollapsedGroupsState
      const next = this.snapshot()
      let changed = false
      for (const key of ['override', 'updateIgnored', 'bundleRecords', 'collapsedGroups'] as const) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
        next[key] = normalizeDict(patch[key])
        if (key === 'collapsedGroups') this.hasCollapsedGroupsState = true
        changed = true
      }
      if (!changed) return this.snapshot()
      this.data = next
      try {
        await this.write()
      } catch (error) {
        this.data = previous
        this.hasCollapsedGroupsState = previousCollapsedState
        throw error
      }
      super.patch(this.snapshot())
      return this.snapshot()
    })
  }

  async setBundleRecord(record: PluginBundleRecord) {
    await this.ready
    return this.queueMutation(async () => {
      const previous = this.data
      this.data = this.snapshot()
      this.data.bundleRecords[record.package] = record
      try {
        await this.write()
      } catch (error) {
        this.data = previous
        throw error
      }
      const snapshot = this.snapshot()
      super.patch(snapshot)
      return snapshot
    })
  }

  async migrateFromConfig(config: {
    updateIgnored?: Dict<string | UpdateIgnoreRule>
    bundleRecords?: Dict<PluginBundleRecord>
    collapsedGroups?: Dict<boolean>
  }) {
    await this.ready
    const patch: Partial<MarketDataStorePayload> = {}
    const previousVersion = this.collapsedGroupsVersion
    const migrateCollapsedGroups = this.collapsedGroupsVersion < COLLAPSED_GROUPS_VERSION
    if (!Object.keys(this.data.updateIgnored).length && Object.keys(config.updateIgnored ?? {}).length) {
      patch.updateIgnored = config.updateIgnored
    }
    if (!Object.keys(this.data.bundleRecords).length && Object.keys(config.bundleRecords ?? {}).length) {
      patch.bundleRecords = config.bundleRecords
    }
    if (!this.hasCollapsedGroupsState) {
      patch.collapsedGroups = config.collapsedGroups ?? {}
    }
    if (migrateCollapsedGroups) {
      const collapsedGroups = normalizeDict<boolean>(patch.collapsedGroups ?? this.data.collapsedGroups)
      delete collapsedGroups.installed
      patch.collapsedGroups = collapsedGroups
      this.collapsedGroupsVersion = COLLAPSED_GROUPS_VERSION
    }
    try {
      if (Object.keys(patch).length) await this.patch(patch)
    } catch (error) {
      this.collapsedGroupsVersion = previousVersion
      throw error
    }
  }

  private snapshot(): MarketDataStorePayload {
    return {
      override: { ...this.data.override },
      updateIgnored: { ...this.data.updateIgnored },
      bundleRecords: { ...this.data.bundleRecords },
      collapsedGroups: { ...this.data.collapsedGroups },
    }
  }

  private async load() {
    try {
      const content = await fsp.readFile(this.file, 'utf8')
      const value = JSON.parse(content)
      this.hasCollapsedGroupsState = Object.prototype.hasOwnProperty.call(value, 'collapsedGroups')
      this.collapsedGroupsVersion = Number.isInteger(value?.collapsedGroupsVersion)
        ? Math.max(0, value.collapsedGroupsVersion)
        : 0
      this.data = normalizeStore(value)
    } catch (error) {
      if ((error as any)?.code !== 'ENOENT') {
        logger.warn(`failed to read market-next data store: ${error instanceof Error ? error.message : error}`)
      }
      this.hasCollapsedGroupsState = false
      this.collapsedGroupsVersion = 0
      this.data = emptyStore()
    }
  }

  private queueMutation<T>(action: () => Promise<T>): Promise<T> {
    const result = this.mutationTask.then(action)
    this.mutationTask = result.then(() => {}, () => {})
    return result
  }

  private async write() {
    const tempFile = `${this.file}.${process.pid}.${randomUUID()}.tmp`
    try {
      await fsp.mkdir(dirname(this.file), { recursive: true })
      await fsp.writeFile(tempFile, JSON.stringify({
        ...this.data,
        collapsedGroupsVersion: this.collapsedGroupsVersion,
      }, null, 2))
      await fsp.rename(tempFile, this.file)
    } catch (error) {
      await fsp.rm(tempFile, { force: true }).catch(() => {})
      logger.warn(`failed to write market-next data store: ${error instanceof Error ? error.message : error}`)
      throw error
    }
  }
}

function normalizeStore(value: any): MarketDataStorePayload {
  return {
    override: normalizeDict(value?.override),
    updateIgnored: normalizeDict(value?.updateIgnored),
    bundleRecords: normalizeDict(value?.bundleRecords),
    collapsedGroups: normalizeDict<boolean>(value?.collapsedGroups),
  }
}

function normalizeDict<T = any>(value: unknown): Dict<T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return { ...(value as Dict<T>) }
}

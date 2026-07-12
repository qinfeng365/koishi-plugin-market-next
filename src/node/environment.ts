import { createHash } from 'crypto'
import { promises as fsp } from 'fs'
import { dirname } from 'path'
import type { Dict } from 'koishi'
import { compare, valid } from 'semver'

export interface EnvironmentDependencySnapshot {
  request: string
  resolved?: string
  workspace?: boolean
  invalid?: boolean
}

export type EnvironmentSnapshotSource = 'startup' | 'operation' | 'external'

export interface EnvironmentSnapshot {
  id: string
  createdAt: number
  lastSeenAt?: number
  source: EnvironmentSnapshotSource
  operationId?: string
  dependencies: Dict<EnvironmentDependencySnapshot>
}

export interface EnvironmentSnapshotSummary {
  id: string
  createdAt: number
  lastSeenAt?: number
  source: EnvironmentSnapshotSource
  operationId?: string
  dependencyCount: number
  current: boolean
}

export type EnvironmentChangeStatus =
  | 'upgrade'
  | 'downgrade'
  | 'added'
  | 'removed'
  | 'changed'
  | 'unchanged'
  | 'unsupported'

export interface EnvironmentSnapshotChange {
  name: string
  currentRequest?: string
  currentVersion?: string
  targetRequest?: string
  targetVersion?: string
  status: EnvironmentChangeStatus
  reason?: 'workspace'
}

export interface EnvironmentSnapshotPreview {
  snapshot: EnvironmentSnapshotSummary
  changes: EnvironmentSnapshotChange[]
  actionableCount: number
  unsupportedCount: number
}

interface PersistedEnvironmentSnapshotStore {
  version: 1
  snapshots: EnvironmentSnapshot[]
}

const MAX_SNAPSHOTS = 60

export function normalizeEnvironmentDependencies(dependencies: Dict<EnvironmentDependencySnapshot>) {
  const result: Dict<EnvironmentDependencySnapshot> = {}
  for (const name of Object.keys(dependencies).sort((a, b) => a.localeCompare(b))) {
    const dependency = dependencies[name]
    if (!dependency || typeof dependency.request !== 'string') continue
    result[name] = {
      request: dependency.request,
      resolved: dependency.resolved || undefined,
      workspace: dependency.workspace || undefined,
      invalid: dependency.invalid || undefined,
    }
  }
  return result
}

function canonicalDependencies(dependencies: Dict<EnvironmentDependencySnapshot>) {
  const normalized = normalizeEnvironmentDependencies(dependencies)
  return JSON.stringify(Object.entries(normalized).map(([name, dependency]) => [
    name,
    dependency.resolved || dependency.request,
    !!dependency.workspace,
  ]))
}

export function getEnvironmentSnapshotId(dependencies: Dict<EnvironmentDependencySnapshot>) {
  return `env-${createHash('sha256').update(canonicalDependencies(dependencies)).digest('hex').slice(0, 20)}`
}

export function createEnvironmentSnapshot(
  dependencies: Dict<EnvironmentDependencySnapshot>,
  source: EnvironmentSnapshotSource,
  operationId?: string,
  now = Date.now(),
): EnvironmentSnapshot {
  const normalized = normalizeEnvironmentDependencies(dependencies)
  return {
    id: getEnvironmentSnapshotId(normalized),
    createdAt: now,
    lastSeenAt: now,
    source,
    operationId,
    dependencies: normalized,
  }
}

function sameDependency(left?: EnvironmentDependencySnapshot, right?: EnvironmentDependencySnapshot) {
  if (!left || !right) return false
  return (left.resolved || left.request) === (right.resolved || right.request)
    && !!left.workspace === !!right.workspace
}

function displayVersion(dependency?: EnvironmentDependencySnapshot) {
  return dependency?.resolved || dependency?.request
}

export function getEnvironmentDiff(current: EnvironmentSnapshot, target: EnvironmentSnapshot) {
  const names = new Set([
    ...Object.keys(current.dependencies),
    ...Object.keys(target.dependencies),
  ])
  return [...names].sort((a, b) => a.localeCompare(b)).map((name): EnvironmentSnapshotChange => {
    const currentDependency = current.dependencies[name]
    const targetDependency = target.dependencies[name]
    const base = {
      name,
      currentRequest: currentDependency?.request,
      currentVersion: displayVersion(currentDependency),
      targetRequest: targetDependency?.request,
      targetVersion: displayVersion(targetDependency),
    }

    if (sameDependency(currentDependency, targetDependency)) {
      return { ...base, status: 'unchanged' }
    }

    if (currentDependency?.workspace || targetDependency?.workspace) {
      return {
        ...base,
        status: 'unsupported',
        reason: 'workspace',
      }
    }

    if (!currentDependency) return { ...base, status: 'added' }
    if (!targetDependency) return { ...base, status: 'removed' }

    const currentVersion = currentDependency.resolved
    const targetVersion = targetDependency.resolved
    if (currentVersion && targetVersion && valid(currentVersion) && valid(targetVersion)) {
      const direction = compare(targetVersion, currentVersion)
      if (direction > 0) return { ...base, status: 'upgrade' }
      if (direction < 0) return { ...base, status: 'downgrade' }
    }
    return { ...base, status: 'changed' }
  })
}

export function getEnvironmentInstallChanges(diff: EnvironmentSnapshotChange[], target: EnvironmentSnapshot) {
  const changes: Dict<string> = {}
  for (const change of diff) {
    if (change.status === 'unchanged') continue
    const dependency = target.dependencies[change.name]
    changes[change.name] = dependency
      ? dependency.workspace ? dependency.request : dependency.resolved || dependency.request
      : ''
  }
  return changes
}

export function summarizeEnvironmentSnapshot(snapshot: EnvironmentSnapshot, currentId?: string): EnvironmentSnapshotSummary {
  return {
    id: snapshot.id,
    createdAt: snapshot.createdAt,
    lastSeenAt: snapshot.lastSeenAt,
    source: snapshot.source,
    operationId: snapshot.operationId,
    dependencyCount: Object.keys(snapshot.dependencies).length,
    current: snapshot.id === currentId,
  }
}

export class EnvironmentSnapshotStore {
  private loaded?: Promise<void>
  private writeTask = Promise.resolve()
  private value: PersistedEnvironmentSnapshotStore = { version: 1, snapshots: [] }

  constructor(private readonly filename: string, private readonly onError: (message: string) => void) {}

  private async load() {
    if (!this.loaded) {
      this.loaded = (async () => {
        try {
          const parsed = JSON.parse(await fsp.readFile(this.filename, 'utf8')) as PersistedEnvironmentSnapshotStore
          if (parsed?.version !== 1 || !Array.isArray(parsed.snapshots)) throw new Error('invalid snapshot store')
          this.value = {
            version: 1,
            snapshots: parsed.snapshots.filter(snapshot => snapshot?.id && snapshot?.dependencies),
          }
        } catch (error: any) {
          if (error?.code !== 'ENOENT') {
            this.onError(`failed to read environment snapshots: ${error instanceof Error ? error.message : error}`)
          }
          this.value = { version: 1, snapshots: [] }
        }
      })()
    }
    await this.loaded
  }

  private async waitForWrites() {
    await this.load()
    await this.writeTask
  }

  private async persist() {
    await fsp.mkdir(dirname(this.filename), { recursive: true })
    const temporary = `${this.filename}.${process.pid}.${Date.now()}.tmp`
    await fsp.writeFile(temporary, JSON.stringify(this.value, null, 2) + '\n')
    try {
      await fsp.rename(temporary, this.filename)
    } catch (error: any) {
      if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error
      await fsp.rm(this.filename, { force: true })
      await fsp.rename(temporary, this.filename)
    }
  }

  async record(snapshot: EnvironmentSnapshot) {
    await this.load()
    let result!: EnvironmentSnapshot
    const task = this.writeTask.then(async () => {
      const existing = this.value.snapshots.find(item => item.id === snapshot.id)
      if (existing) {
        existing.lastSeenAt = snapshot.lastSeenAt || Date.now()
        if (snapshot.source === 'operation') {
          existing.source = snapshot.source
          existing.operationId = snapshot.operationId
        }
        result = existing
      } else {
        this.value.snapshots.unshift(snapshot)
        result = snapshot
      }
      this.value.snapshots.sort((a, b) => (b.lastSeenAt ?? b.createdAt) - (a.lastSeenAt ?? a.createdAt))
      this.value.snapshots.splice(MAX_SNAPSHOTS)
      await this.persist()
    })
    this.writeTask = task.catch((error) => {
      this.onError(`failed to write environment snapshots: ${error instanceof Error ? error.message : error}`)
    })
    await task
    return result
  }

  async list() {
    await this.waitForWrites()
    return [...this.value.snapshots]
  }

  async get(id: string) {
    await this.waitForWrites()
    return this.value.snapshots.find(snapshot => snapshot.id === id)
  }
}

import { Context, Dict, Logger, Time } from 'koishi'
import { basename, resolve } from 'path'
import { promises as fsp } from 'fs'
import {
  formatDeps,
  type Dependency,
  type InstallerConfig,
  type InstallOptions,
} from './installer-types'

const logger = new Logger('market')
const DEFAULT_INSTALL_LOG_RETENTION = Time.day * 3
const INSTALL_LOG_DIR = 'market-next-install-logs'
const INSTALL_LOG_DETAIL_LIMIT = 512 * 1024
const INSTALL_LOG_HEAD_LIMIT = 8 * 1024
const INSTALL_LOG_TAIL_LIMIT = 32 * 1024

export type InstallHistoryStatus = 'running' | 'success' | 'error' | 'unknown'

export interface InstallHistoryChange {
  name: string
  beforeRequest: string | null
  beforeResolved: string | null
  afterRequest: string | null
  afterResolved: string | null
}

export interface InstallHistoryEntry {
  id: string
  startedAt: number
  finishedAt?: number
  duration?: number
  status: InstallHistoryStatus
  deps: string
  forced: boolean
  installEndpoint?: string
  size: number
  changes: InstallHistoryChange[]
}

export interface InstallLogDetail extends InstallHistoryEntry {
  content: string
  truncated: boolean
}

interface InstallHistoryMetadata {
  version: 1
  id: string
  startedAt: number
  finishedAt?: number
  status: InstallHistoryStatus
  deps: string
  forced: boolean
  installEndpoint?: string
  changes: InstallHistoryChange[]
}

export class InstallHistoryStore {
  private logFile?: string
  private metadataFile?: string
  private metadata?: InstallHistoryMetadata
  private writeTask = Promise.resolve()
  private cleanupTask?: Promise<void>

  constructor(
    private ctx: Context,
    private config: InstallerConfig,
    private getResolvedVersion: (name: string) => string | undefined,
  ) {}

  get currentId() {
    return this.metadata?.id
  }

  resetCurrent() {
    this.logFile = undefined
    this.metadataFile = undefined
    this.metadata = undefined
    this.writeTask = Promise.resolve()
  }

  async cleanup() {
    if (this.cleanupTask) return this.cleanupTask
    this.cleanupTask = (async () => {
      const dir = this.getDirectory()
      try {
        const entries = await fsp.readdir(dir, { withFileTypes: true })
        const now = Date.now()
        await Promise.all(entries
          .filter(entry => entry.isFile() && (entry.name.endsWith('.log') || entry.name.endsWith('.log.json')))
          .map(async (entry) => {
            const path = resolve(dir, entry.name)
            if (path === this.logFile || path === this.metadataFile) return
            try {
              const stat = await fsp.stat(path)
              if (now - stat.mtimeMs <= this.getRetention()) return
              await fsp.rm(path, { force: true })
            } catch (error) {
              logger.debug(`failed to cleanup install log ${path}: ${error instanceof Error ? error.message : error}`)
            }
          }))
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          logger.debug(`failed to cleanup install logs: ${error instanceof Error ? error.message : error}`)
        }
      }
    })().finally(() => {
      this.cleanupTask = undefined
    })
    return this.cleanupTask
  }

  async start(
    deps: Dict<string>,
    forced?: boolean,
    options: InstallOptions = {},
    changes: InstallHistoryChange[] = [],
  ) {
    await this.cleanup()
    const dir = this.getDirectory()
    await fsp.mkdir(dir, { recursive: true })
    const now = Date.now()
    const suffix = sanitizeLogSegment(formatDeps(deps) || 'noop')
    const file = resolve(dir, `${formatLogTimestamp(now)}-${suffix}.log`)
    const id = basename(file)
    await fsp.writeFile(file, [
      'market-next dependency operation log',
      `startedAt: ${new Date(now).toISOString()}`,
      `cwd: ${this.ctx.baseDir}`,
      `deps: ${formatDeps(deps) || '(none)'}`,
      `forced: ${!!forced}`,
      `installEndpoint: ${options.installEndpoint || '(default)'}`,
      '',
    ].join('\n'))
    this.logFile = file
    this.metadataFile = file + '.json'
    this.metadata = {
      version: 1,
      id,
      startedAt: now,
      status: 'running',
      deps: formatDeps(deps) || '(none)',
      forced: !!forced,
      installEndpoint: options.installEndpoint || undefined,
      changes,
    }
    this.writeTask = Promise.resolve()
    await this.writeMetadata().catch((error) => {
      logger.debug(`failed to write install log metadata ${this.metadataFile}: ${error instanceof Error ? error.message : error}`)
    })
    logger.info(`dependency install log started: ${file}`)
  }

  emit(type: 'stdout' | 'stderr', line: string) {
    const cleanLine = sanitizeInstallLogText(line)
    this.ctx.get('console')?.broadcast('market/install-log', { type, line: cleanLine })
    this.write(type, cleanLine)
  }

  async finish(result?: { code?: number | null, failed?: boolean, reason?: string }) {
    if (!this.logFile) return
    if (result?.failed) {
      // Failure detail is already emitted by the catch path; only close the session.
    } else if (result?.code == null) {
      this.write('stderr', 'dependency operation ended without a package manager exit code')
    } else if (result.code) {
      this.write('stderr', `dependency operation finished with code ${result.code}`)
    } else {
      this.write('stdout', 'dependency operation finished with code 0')
    }
    await this.writeTask
    if (this.metadata) {
      const success = !result?.failed && result?.code === 0
      this.metadata.status = success ? 'success' : 'error'
      this.metadata.finishedAt = Date.now()
      if (success) {
        this.metadata.changes = this.metadata.changes.map(change => ({
          ...change,
          afterResolved: this.getResolvedVersion(change.name) ?? null,
        }))
      }
      await this.writeMetadata().catch((error) => {
        logger.debug(`failed to finish install log metadata ${this.metadataFile}: ${error instanceof Error ? error.message : error}`)
      })
    }
    logger.info(`dependency install log saved: ${this.logFile}`)
    this.resetCurrent()
  }

  async getHistory(limit = 20) {
    await this.cleanup()
    const count = clamp(Math.floor(Number(limit) || 20), 1, 50)
    const dir = this.getDirectory()
    let files: Array<{ id: string, mtime: number }> = []
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      files = (await Promise.all(entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.log'))
        .map(async entry => ({
          id: entry.name,
          mtime: (await fsp.stat(resolve(dir, entry.name))).mtimeMs,
        }))))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, count)
    } catch (error: any) {
      if (error?.code === 'ENOENT') return []
      throw error
    }
    const records = await Promise.all(files.map(file => this.getEntry(file.id)))
    return records.filter(Boolean) as InstallHistoryEntry[]
  }

  async getDetail(id: string) {
    const file = this.getPath(id)
    if (!file) return
    if (file === this.logFile) await this.writeTask
    const entry = await this.getEntry(id)
    if (!entry) return
    const result = await this.readLog(file, INSTALL_LOG_DETAIL_LIMIT, 128 * 1024, 384 * 1024)
    return {
      ...entry,
      content: sanitizeInstallLogText(result.content),
      truncated: result.truncated,
    } as InstallLogDetail
  }

  private getDirectory() {
    return resolve(this.ctx.baseDir, 'data', INSTALL_LOG_DIR)
  }

  private getRetention() {
    const hours = Number(this.config.installLogRetentionHours)
    if (Number.isFinite(hours) && hours > 0) return Math.max(1, hours) * Time.hour
    const legacyRetention = Number(this.config.installLogRetention)
    return Number.isFinite(legacyRetention) && legacyRetention > 0
      ? Math.max(Time.hour, legacyRetention)
      : DEFAULT_INSTALL_LOG_RETENTION
  }

  private async writeMetadata() {
    if (!this.metadataFile || !this.metadata) return
    await fsp.writeFile(this.metadataFile, JSON.stringify(this.metadata, null, 2) + '\n')
  }

  private write(type: string, line: string) {
    const file = this.logFile
    if (!file) return
    const text = `[${new Date().toISOString()}] [${type}] ${line}\n`
    this.writeTask = this.writeTask
      .then(() => fsp.appendFile(file, text))
      .catch((error) => {
        logger.debug(`failed to write install log ${file}: ${error instanceof Error ? error.message : error}`)
      })
  }

  private getPath(id: string) {
    if (!id || basename(id) !== id || !id.endsWith('.log')) return
    return resolve(this.getDirectory(), id)
  }

  private async readMetadata(id: string) {
    const file = this.getPath(id)
    if (!file) return
    try {
      const metadata: InstallHistoryMetadata = JSON.parse(await fsp.readFile(file + '.json', 'utf8'))
      if (metadata?.version !== 1 || metadata.id !== id || !Array.isArray(metadata.changes)) return
      return metadata
    } catch (error: any) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
        logger.debug(`failed to read install log metadata ${id}: ${error instanceof Error ? error.message : error}`)
      }
    }
  }

  private async readLog(file: string, limit: number, headLimit: number, tailLimit: number) {
    const stat = await fsp.stat(file)
    if (stat.size <= limit) {
      return {
        content: await fsp.readFile(file, 'utf8'),
        truncated: false,
        size: stat.size,
      }
    }
    const handle = await fsp.open(file, 'r')
    try {
      const headSize = Math.min(headLimit, stat.size)
      const tailSize = Math.min(tailLimit, Math.max(0, stat.size - headSize))
      const head = Buffer.alloc(headSize)
      const tail = Buffer.alloc(tailSize)
      if (headSize) await handle.read(head, 0, headSize, 0)
      if (tailSize) await handle.read(tail, 0, tailSize, stat.size - tailSize)
      return {
        content: `${head.toString('utf8')}\n\n... ${stat.size - headSize - tailSize} bytes omitted ...\n\n${tail.toString('utf8')}`,
        truncated: true,
        size: stat.size,
      }
    } finally {
      await handle.close()
    }
  }

  private parseLegacy(id: string, content: string, size: number): InstallHistoryEntry {
    const startedText = content.match(/^startedAt:\s*(.+)$/m)?.[1]?.trim()
    const startedAt = Date.parse(startedText || '') || 0
    const deps = content.match(/^deps:\s*(.*)$/m)?.[1]?.trim() || '(unknown)'
    const forced = content.match(/^forced:\s*(true|false)$/m)?.[1] === 'true'
    const endpointText = content.match(/^installEndpoint:\s*(.*)$/m)?.[1]?.trim()
    const active = basename(this.logFile || '') === id
    const status = active
      ? 'running'
      : /dependency operation finished with code 0\s*$/m.test(content)
        ? 'success'
        : /dependency operation (?:failed|finished with code|ended without)|package manager (?:terminated|failed to start)/m.test(content)
          ? 'error'
          : 'unknown'
    const timestamps = [...content.matchAll(/^\[([^\]]+)\]/gm)]
    const finishedAt = status === 'running' ? undefined : Date.parse(timestamps.at(-1)?.[1] || '') || undefined
    return {
      id,
      startedAt,
      finishedAt,
      duration: startedAt && finishedAt ? Math.max(0, finishedAt - startedAt) : undefined,
      status,
      deps,
      forced,
      installEndpoint: endpointText && endpointText !== '(default)' ? endpointText : undefined,
      size,
      changes: [],
    }
  }

  private createEntry(metadata: InstallHistoryMetadata, size: number): InstallHistoryEntry {
    const status = metadata.status === 'running' && basename(this.logFile || '') !== metadata.id
      ? 'unknown'
      : metadata.status
    return {
      id: metadata.id,
      startedAt: metadata.startedAt,
      finishedAt: metadata.finishedAt,
      duration: metadata.finishedAt ? Math.max(0, metadata.finishedAt - metadata.startedAt) : undefined,
      status,
      deps: metadata.deps,
      forced: metadata.forced,
      installEndpoint: metadata.installEndpoint,
      size,
      changes: metadata.changes,
    }
  }

  private async getEntry(id: string) {
    const file = this.getPath(id)
    if (!file) return
    if (file === this.logFile) await this.writeTask
    let stat
    try {
      stat = await fsp.stat(file)
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error
      return
    }
    const metadata = await this.readMetadata(id)
    if (metadata) return this.createEntry(metadata, stat.size)
    const preview = await this.readLog(file, INSTALL_LOG_HEAD_LIMIT + INSTALL_LOG_TAIL_LIMIT, INSTALL_LOG_HEAD_LIMIT, INSTALL_LOG_TAIL_LIMIT)
    return this.parseLegacy(id, preview.content, stat.size)
  }
}

export function createInstallHistoryChanges(
  before: Dict<string>,
  after: Dict<string>,
  localDeps: Dict<Dependency>,
): InstallHistoryChange[] {
  return Object.keys(after).map(name => ({
    name,
    beforeRequest: Object.prototype.hasOwnProperty.call(before, name) ? before[name] : null,
    beforeResolved: localDeps[name]?.resolved ?? null,
    afterRequest: after[name] || null,
    afterResolved: null,
  }))
}

function formatLogTimestamp(value: number) {
  return new Date(value).toISOString().replace(/[:.]/g, '-')
}

function sanitizeLogSegment(value: string) {
  return value
    .replace(/[^a-z0-9@._+-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'operation'
}

function sanitizeInstallLogText(value: string) {
  return value
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, '')
    .replace(/\r(?!\n)/g, '')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

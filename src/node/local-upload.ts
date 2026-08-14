import { createHash, randomUUID } from 'crypto'
import { FileHandle, open } from 'fs/promises'
import { basename, dirname, relative, resolve } from 'path'
import { promises as fsp } from 'fs'
import Scanner, { PackageJson } from '@koishijs/registry'
import { compare, valid } from 'semver'
import { list } from 'tar'
import {
  createHashedLocalBindingFilename,
  createLocalBindingRequest,
  MAX_LOCAL_BINDING_PACK_SIZE,
} from './local-binding'

const LOCAL_UPLOAD_CHUNK_SIZE = 512 * 1024
const LOCAL_UPLOAD_TTL = 15 * 60 * 1000
const MAX_ARCHIVE_ENTRIES = 8192
const MAX_ARCHIVE_EXPANDED_SIZE = 256 * 1024 * 1024
const MAX_PACKAGE_MANIFEST_SIZE = 1024 * 1024

export type LocalPackageOperation = 'install' | 'upgrade' | 'downgrade' | 'replace'

export interface LocalPackageUploadStartRequest {
  filename: string
  size: number
}

export interface LocalPackageUploadStartResult {
  uploadId: string
  chunkSize: number
  maxSize: number
}

export interface LocalPackageUploadChunkRequest {
  uploadId: string
  index: number
  data: string
}

export interface LocalPackageUploadProgress {
  received: number
  size: number
}

export interface LocalPackageUploadFinishRequest {
  uploadId: string
}

export interface LocalPackageUploadPreview {
  uploadId: string
  filename: string
  name: string
  version: string
  description?: string
  size: number
  hash: string
  scripts: string[]
  currentRequest?: string
  currentVersion?: string
  operation: LocalPackageOperation
}

export interface LocalPackageUploadCommitResult {
  name: string
  version: string
  filename: string
  request: string
  size: number
  hash: string
}

interface ValidatedLocalPackage {
  manifest: PackageJson
  hash: string
  targetFilename: string
}

interface LocalUploadSession {
  id: string
  originalFilename: string
  path: string
  size: number
  received: number
  nextIndex: number
  touchedAt: number
  handle?: FileHandle
  hash: ReturnType<typeof createHash>
  validated?: ValidatedLocalPackage
}

export class LocalPackageUploadStore {
  private readonly root: string
  private readonly temporaryRoot: string
  private readonly sessions = new Map<string, LocalUploadSession>()

  constructor(baseDir: string, private readonly warn: (message: string) => void) {
    this.root = resolve(baseDir, '.yarn', 'local')
    this.temporaryRoot = resolve(this.root, '.market-next-upload')
  }

  async start(request: LocalPackageUploadStartRequest): Promise<LocalPackageUploadStartResult> {
    await this.pruneExpired()
    const filename = validateUploadFilename(request?.filename)
    const size = Number(request?.size)
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_LOCAL_BINDING_PACK_SIZE) {
      throw new Error(`本地插件归档大小必须在 1 B 到 ${formatBytes(MAX_LOCAL_BINDING_PACK_SIZE)} 之间。`)
    }

    await fsp.mkdir(this.temporaryRoot, { recursive: true })
    const uploadId = randomUUID()
    const path = resolve(this.temporaryRoot, `${uploadId}.part`)
    const handle = await open(path, 'wx')
    this.sessions.set(uploadId, {
      id: uploadId,
      originalFilename: filename,
      path,
      size,
      received: 0,
      nextIndex: 0,
      touchedAt: Date.now(),
      handle,
      hash: createHash('sha256'),
    })
    return { uploadId, chunkSize: LOCAL_UPLOAD_CHUNK_SIZE, maxSize: MAX_LOCAL_BINDING_PACK_SIZE }
  }

  async append(request: LocalPackageUploadChunkRequest): Promise<LocalPackageUploadProgress> {
    const session = this.getSession(request?.uploadId)
    if (session.validated) throw new Error('本地插件归档已经完成校验。')
    if (!Number.isSafeInteger(request?.index) || request.index !== session.nextIndex) {
      throw new Error('本地插件上传分块顺序无效，请重新上传。')
    }
    const buffer = decodeBase64Chunk(request?.data)
    const remaining = session.size - session.received
    if (!buffer.length || buffer.length > LOCAL_UPLOAD_CHUNK_SIZE || buffer.length > remaining) {
      throw new Error('本地插件上传分块大小无效，请重新上传。')
    }
    if (!session.handle) throw new Error('本地插件上传会话已经关闭。')

    const { bytesWritten } = await session.handle.write(buffer, 0, buffer.length, session.received)
    if (bytesWritten !== buffer.length) throw new Error('本地插件归档写入不完整，请重新上传。')
    session.hash.update(buffer)
    session.received += bytesWritten
    session.nextIndex++
    session.touchedAt = Date.now()
    return { received: session.received, size: session.size }
  }

  async finish(request: LocalPackageUploadFinishRequest): Promise<ValidatedLocalPackage & {
    uploadId: string
    filename: string
    size: number
  }> {
    const session = this.getSession(request?.uploadId)
    if (session.validated) {
      return {
        ...session.validated,
        uploadId: session.id,
        filename: session.originalFilename,
        size: session.size,
      }
    }
    if (session.received !== session.size) {
      throw new Error(`本地插件归档尚未上传完成（${formatBytes(session.received)} / ${formatBytes(session.size)}）。`)
    }
    await this.closeHandle(session)

    try {
      const hash = session.hash.digest('hex')
      const manifest = await inspectPackageArchive(session.path)
      const targetFilename = createCanonicalLocalPackageFilename(manifest.name, manifest.version, hash)
      session.validated = { manifest, hash, targetFilename }
      session.touchedAt = Date.now()
      return {
        ...session.validated,
        uploadId: session.id,
        filename: session.originalFilename,
        size: session.size,
      }
    } catch (error) {
      await this.removeSession(session)
      throw error
    }
  }

  async commit(uploadId: string): Promise<LocalPackageUploadCommitResult> {
    const session = this.getSession(uploadId)
    if (!session.validated) throw new Error('请先完成本地插件归档校验。')
    await this.closeHandle(session)
    await fsp.mkdir(this.root, { recursive: true })

    const target = resolve(this.root, session.validated.targetFilename)
    assertInside(this.root, target)
    const existing = await readFileHash(target)
    if (existing && existing !== session.validated.hash) {
      throw new Error('同名本地插件归档已存在，但文件内容不一致。')
    }
    if (!existing) {
      try {
        await fsp.rename(session.path, target)
      } catch (error) {
        const concurrent = await readFileHash(target)
        if (concurrent !== session.validated.hash) throw error
        await fsp.rm(session.path, { force: true })
      }
    } else {
      await fsp.rm(session.path, { force: true })
    }
    this.sessions.delete(session.id)

    return {
      name: session.validated.manifest.name,
      version: session.validated.manifest.version,
      filename: session.validated.targetFilename,
      request: createLocalBindingRequest(session.validated.targetFilename),
      size: session.size,
      hash: session.validated.hash,
    }
  }

  async cancel(uploadId: string) {
    const session = this.sessions.get(uploadId)
    if (!session) return false
    await this.removeSession(session)
    return true
  }

  async pruneExpired(now = Date.now()) {
    const expired = [...this.sessions.values()].filter(session => now - session.touchedAt > LOCAL_UPLOAD_TTL)
    await Promise.all(expired.map(session => this.removeSession(session).catch((error) => {
      this.warn(`failed to clean expired local upload ${session.id}: ${error instanceof Error ? error.message : error}`)
    })))
    const activePaths = new Set([...this.sessions.values()].map(session => session.path))
    const entries = await fsp.readdir(this.temporaryRoot, { withFileTypes: true }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    })
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile() || !entry.name.endsWith('.part')) return
      const path = resolve(this.temporaryRoot, entry.name)
      if (activePaths.has(path)) return
      const stat = await fsp.stat(path)
      if (now - stat.mtimeMs <= LOCAL_UPLOAD_TTL) return
      await fsp.rm(path, { force: true })
    }))
  }

  async dispose() {
    await Promise.all([...this.sessions.values()].map(session => this.removeSession(session).catch((error) => {
      this.warn(`failed to dispose local upload ${session.id}: ${error instanceof Error ? error.message : error}`)
    })))
  }

  private getSession(uploadId: string) {
    if (typeof uploadId !== 'string' || !/^[0-9a-f-]{36}$/i.test(uploadId)) {
      throw new Error('本地插件上传会话无效。')
    }
    const session = this.sessions.get(uploadId)
    if (!session) throw new Error('本地插件上传已过期，请重新选择文件。')
    return session
  }

  private async closeHandle(session: LocalUploadSession) {
    const handle = session.handle
    session.handle = undefined
    await handle?.close()
  }

  private async removeSession(session: LocalUploadSession) {
    this.sessions.delete(session.id)
    await this.closeHandle(session).catch(() => {})
    await fsp.rm(session.path, { force: true })
  }
}

export function getLocalPackageOperation(currentRequest: string | undefined, currentVersion: string | undefined, targetVersion: string): LocalPackageOperation {
  if (!currentRequest) return 'install'
  if (!currentVersion || !valid(currentVersion) || !valid(targetVersion)) return 'replace'
  const result = compare(targetVersion, currentVersion)
  if (result > 0) return 'upgrade'
  if (result < 0) return 'downgrade'
  return 'replace'
}

async function inspectPackageArchive(path: string): Promise<PackageJson> {
  let entryCount = 0
  let expandedSize = 0
  let manifestFound = false
  const chunks: Buffer[] = []

  try {
    await list({
      file: path,
      strict: true,
      maxReadSize: 1024 * 1024,
      maxMetaEntrySize: 1024 * 1024,
      maxDecompressionRatio: 200,
      onReadEntry(entry) {
        entryCount++
        expandedSize += Number(entry.size) || 0
        if (entryCount > MAX_ARCHIVE_ENTRIES || expandedSize > MAX_ARCHIVE_EXPANDED_SIZE) {
          throw new Error('本地插件归档解压后内容过大或文件数量过多。')
        }
        validateArchiveEntry(entry.path, entry.type)
        if (entry.path.replace(/\\/g, '/') !== 'package/package.json') return
        if (manifestFound) throw new Error('本地插件归档包含重复的 package.json。')
        if (entry.size <= 0 || entry.size > MAX_PACKAGE_MANIFEST_SIZE) {
          throw new Error('本地插件 package.json 大小无效。')
        }
        manifestFound = true
        entry.on('data', chunk => chunks.push(Buffer.from(chunk)))
      },
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`无法读取本地插件归档：${detail}`)
  }

  if (!manifestFound) throw new Error('本地插件归档中缺少 package/package.json。请使用 npm pack 生成 .tgz。')
  let manifest: PackageJson
  try {
    manifest = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('本地插件 package.json 不是有效的 JSON。')
  }
  if (!manifest || typeof manifest !== 'object') throw new Error('本地插件 package.json 无效。')
  if (typeof manifest.name !== 'string' || !Scanner.isPlugin(manifest.name)) {
    throw new Error('归档中的包名不是有效的 Koishi 插件名称。')
  }
  if (typeof manifest.version !== 'string' || !valid(manifest.version)) {
    throw new Error('归档中的插件版本不是有效的 SemVer。')
  }
  return manifest
}

function validateArchiveEntry(value: string, type: string) {
  const path = value.replace(/\\/g, '/')
  const parts = path.split('/').filter(Boolean)
  if (!path || path.startsWith('/') || parts[0] !== 'package' || parts.includes('..')) {
    throw new Error(`本地插件归档包含非法路径：${value}`)
  }
  if (type === 'SymbolicLink' || type === 'Link' || type === 'CharacterDevice' || type === 'BlockDevice' || type === 'FIFO') {
    throw new Error(`本地插件归档包含不允许的条目类型：${type}`)
  }
}

function validateUploadFilename(value: unknown) {
  if (typeof value !== 'string' || basename(value) !== value || !value.toLowerCase().endsWith('.tgz')) {
    throw new Error('请选择 npm pack 生成的 .tgz 文件。')
  }
  return value
}

function decodeBase64Chunk(value: unknown) {
  if (typeof value !== 'string'
    || value.length > Math.ceil(LOCAL_UPLOAD_CHUNK_SIZE / 3) * 4 + 4
    || value.length % 4
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('本地插件上传分块编码无效。')
  }
  const buffer = Buffer.from(value, 'base64')
  if (buffer.toString('base64') !== value) throw new Error('本地插件上传分块编码无效。')
  return buffer
}

function createCanonicalLocalPackageFilename(name: string, version: string, hash: string) {
  const slug = name
    .replace(/^@/, '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-z0-9@._+-]+/gi, '-')
    .slice(0, 120)
  return createHashedLocalBindingFilename(`${slug}-${version}.tgz`, hash.slice(0, 12))
}

async function readFileHash(path: string) {
  try {
    const stat = await fsp.stat(path)
    if (!stat.isFile()) throw new Error('本地插件归档目标不是文件。')
    return createHash('sha256').update(await fsp.readFile(path)).digest('hex')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function assertInside(root: string, target: string) {
  if (dirname(target) !== root || relative(root, target).startsWith('..')) {
    throw new Error('本地插件归档目标路径无效。')
  }
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KiB`
  return `${Math.ceil(value / 1024 / 1024)} MiB`
}

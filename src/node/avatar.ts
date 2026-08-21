import { Context, HTTP, Time } from 'koishi'
import { createHash } from 'crypto'
import { lookup } from 'dns/promises'
import { promises as fsp } from 'fs'
import { isIP } from 'net'
import { resolve } from 'path'

export interface AvatarFetchResult {
  data: string
  type: string
  cached?: boolean
  key?: string
}

const avatarCache = new Map<string, AvatarFetchResult & { expiresAt: number }>()
const AVATAR_CACHE_TTL = Time.day * 7
const AVATAR_CACHE_SWEEP_INTERVAL = Time.hour
const AVATAR_MAX_ENTRIES = 512
const AVATAR_MAX_SIZE = 96 * 1024
const AVATAR_BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain'])
const AVATAR_ALLOWED_HOSTS = new Set(['www.npmjs.com', 'npmjs.com', 's.gravatar.com', 'gravatar.com', 'www.gravatar.com', 'cravatar.cn', 'www.cravatar.cn'])
const AVATAR_DEFAULT_HINTS = new Set(['default', 'mp', 'identicon', 'monsterid', 'wavatar', 'retro', 'robohash', 'blank'])
const AVATAR_FETCH_TIMEOUT = 3000
const AVATAR_HEAD_TIMEOUT = 1200
const AVATAR_MAX_REDIRECTS = 3
const AVATAR_ACCEPT = 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml;q=0.8,*/*;q=0.1'
let avatarDiskCleanupTask: Promise<void> | undefined

interface AvatarDiskCacheEntry extends AvatarFetchResult {
  key: string
  url: string
  cachedAt: number
}

function cleanupAvatarCache() {
  const now = Date.now()
  for (const [key, entry] of avatarCache) {
    if (entry.expiresAt <= now) avatarCache.delete(key)
  }
  while (avatarCache.size > AVATAR_MAX_ENTRIES) {
    const key = avatarCache.keys().next().value
    if (!key) break
    avatarCache.delete(key)
  }
}

function cleanupAvatarCaches(ctx: Context) {
  cleanupAvatarCache()
  void cleanupAvatarDiskCache(ctx)
}

function getAvatarCacheDir(ctx: Context) {
  return resolve(ctx.baseDir, 'cache', 'market-next-avatars')
}

function normalizeAvatarCacheKey(key: string) {
  return key.replace(/[^0-9A-Za-z:@._-]/g, '-').slice(0, 128) || `url:${createHash('sha1').update(key).digest('hex')}`
}

function getAvatarCacheFile(ctx: Context, key: string) {
  return resolve(getAvatarCacheDir(ctx), `${createHash('sha1').update(normalizeAvatarCacheKey(key)).digest('hex')}.json`)
}

function normalizeAvatarDiskCache(value: any, key: string): AvatarDiskCacheEntry | undefined {
  if (!value || typeof value !== 'object') return
  if (value.key && value.key !== key) return
  if (!value.key && value.url !== key) return
  if (typeof value.url !== 'string' || !value.url) return
  if (typeof value.type !== 'string' || !value.type.startsWith('image/')) return
  if (typeof value.data !== 'string' || !value.data) return
  const cachedAt = Number(value.cachedAt)
  if (!Number.isFinite(cachedAt)) return
  if (Date.now() - cachedAt > AVATAR_CACHE_TTL) return
  return { key, url: value.url, type: value.type, data: value.data, cachedAt }
}

async function readAvatarDiskCache(ctx: Context, key: string): Promise<AvatarFetchResult | undefined> {
  try {
    const file = getAvatarCacheFile(ctx, key)
    const entry = normalizeAvatarDiskCache(JSON.parse(await fsp.readFile(file, 'utf8')), key)
    if (!entry) {
      void fsp.unlink(file).catch(() => {})
      return
    }
    if (isAvatarCacheLikelyDefault(entry.url, key)) {
      void fsp.unlink(file).catch(() => {})
      return
    }
    avatarCache.set(key, { data: entry.data, type: entry.type, expiresAt: entry.cachedAt + AVATAR_CACHE_TTL })
    return { data: entry.data, type: entry.type, cached: true }
  } catch (error) {
    if ((error as any)?.code !== 'ENOENT') {
      ctx.logger('market').debug(`failed to read avatar disk cache: ${error instanceof Error ? error.message : error}`)
    }
  }
}

async function writeAvatarDiskCache(ctx: Context, key: string, url: string, result: AvatarFetchResult) {
  try {
    await fsp.mkdir(getAvatarCacheDir(ctx), { recursive: true })
    const file = getAvatarCacheFile(ctx, key)
    const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`
    const entry: AvatarDiskCacheEntry = {
      key,
      url,
      type: result.type,
      data: result.data,
      cachedAt: Date.now(),
    }
    await fsp.writeFile(tempFile, JSON.stringify(entry))
    await fsp.rename(tempFile, file)
  } catch (error) {
    ctx.logger('market').debug(`failed to write avatar disk cache: ${error instanceof Error ? error.message : error}`)
  }
}

async function cleanupAvatarDiskCache(ctx: Context) {
  if (avatarDiskCleanupTask) return avatarDiskCleanupTask
  avatarDiskCleanupTask = (async () => {
    try {
      const dir = getAvatarCacheDir(ctx)
      const files = await fsp.readdir(dir).catch(() => [])
      const entries = await Promise.all(files
        .filter(file => file.endsWith('.json'))
        .map(async (file) => {
          const path = resolve(dir, file)
          try {
            const stat = await fsp.stat(path)
            let cachedAt = stat.mtimeMs
            try {
              const value = JSON.parse(await fsp.readFile(path, 'utf8'))
              cachedAt = Number(value.cachedAt) || cachedAt
              if (!value?.key || !value?.url || typeof value?.data !== 'string' || typeof value?.type !== 'string') {
                await fsp.unlink(path).catch(() => {})
                return
              }
              if (isAvatarCacheLikelyDefault(value.url, normalizeAvatarCacheKey(value.key))) {
                await fsp.unlink(path).catch(() => {})
                return
              }
            } catch {
              await fsp.unlink(path).catch(() => {})
              return
            }
            if (Date.now() - cachedAt > AVATAR_CACHE_TTL) {
              await fsp.unlink(path).catch(() => {})
              return
            }
            return { path, cachedAt }
          } catch {
            return
          }
        }))
      const alive = entries
        .filter((entry): entry is { path: string, cachedAt: number } => !!entry)
        .sort((a, b) => b.cachedAt - a.cachedAt)
      await Promise.all(alive.slice(AVATAR_MAX_ENTRIES).map(entry => fsp.unlink(entry.path).catch(() => {})))
    } finally {
      avatarDiskCleanupTask = undefined
    }
  })()
  return avatarDiskCleanupTask
}

export async function clearAvatarCacheStorage(ctx: Context) {
  const memory = avatarCache.size
  avatarCache.clear()
  if (avatarDiskCleanupTask) await avatarDiskCleanupTask.catch(() => {})
  const dir = getAvatarCacheDir(ctx)
  const files = await fsp.readdir(dir).catch((error) => {
    if ((error as any)?.code === 'ENOENT') return [] as string[]
    throw error
  })
  const disk = files.filter(file => file.endsWith('.json')).length
  await fsp.rm(dir, { recursive: true, force: true })
  return { memory, disk }
}

export async function fetchAvatar(ctx: Context, rawKey: string, rawUrl?: string): Promise<AvatarFetchResult | undefined> {
  const cacheKey = normalizeAvatarCacheKey(rawKey)
  cleanupAvatarCache()
  const cached = avatarCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return { data: cached.data, type: cached.type, cached: true }
  }
  const diskCached = await readAvatarDiskCache(ctx, cacheKey)
  if (diskCached || !rawUrl) return diskCached

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return
  }
  if (!['http:', 'https:'].includes(url.protocol)) return
  if (await isBlockedAvatarTarget(url)) return

  try {
    const checked = await checkAvatarHead(ctx, url)
    if (checked.blocked) return
    const fetched = await fetchAvatarResponse(ctx, checked.url ?? url)
    if (!fetched) return
    const { response, sourceUrl } = fetched
    if (response.status >= 500) {
      await cancelAvatarBody(response.data)
      return
    }
    if (response.status >= 400) {
      await cancelAvatarBody(response.data)
      return
    }
    const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || ''
    if (!type.startsWith('image/')) {
      await cancelAvatarBody(response.data)
      return
    }
    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > AVATAR_MAX_SIZE) {
      await cancelAvatarBody(response.data)
      return
    }
    if (isAvatarDefaultResponse(response.headers)) {
      await cancelAvatarBody(response.data)
      return
    }
    const body = await readLimitedAvatarBody(response.data)
    if (!body?.byteLength) return

    const result: AvatarFetchResult = {
      type,
      data: body.toString('base64'),
    }
    avatarCache.set(cacheKey, { ...result, expiresAt: Date.now() + AVATAR_CACHE_TTL })
    void writeAvatarDiskCache(ctx, cacheKey, sourceUrl, result)
    cleanupAvatarCache()
    return result
  } catch (error) {
    throw error
  }
}

async function checkAvatarHead(ctx: Context, url: URL): Promise<{ url?: URL, blocked?: boolean }> {
  let current = url
  for (let index = 0; index <= AVATAR_MAX_REDIRECTS; index++) {
    if (await isBlockedAvatarTarget(current)) return { blocked: true }
    try {
      const head = await ctx.http('HEAD', current.toString(), {
        timeout: AVATAR_HEAD_TIMEOUT,
        redirect: 'manual',
        validateStatus: status => status >= 200 && status < 600,
        headers: { accept: AVATAR_ACCEPT },
      })
      if (isAvatarRedirect(head.status)) {
        const next = await resolveAvatarRedirect(current, head.headers.get('location'))
        if (!next) return { blocked: true }
        current = next
        continue
      }
      const headLength = Number(head.headers.get('content-length'))
      if (Number.isFinite(headLength) && headLength > AVATAR_MAX_SIZE) return { blocked: true }
      return { url: current }
    } catch (error) {
      ctx.logger('market').debug(`avatar HEAD skipped: url=${current}, error=${error instanceof Error ? error.message : error}`)
      return { url: current }
    }
  }
  return { blocked: true }
}

type AvatarBodyStream = HTTP.ResponseTypes['stream']

async function fetchAvatarResponse(ctx: Context, url: URL): Promise<{ response: HTTP.Response<AvatarBodyStream>, sourceUrl: string } | undefined> {
  let current = url
  for (let index = 0; index <= AVATAR_MAX_REDIRECTS; index++) {
    if (await isBlockedAvatarTarget(current)) return
    const response = await ctx.http(current.toString(), {
      timeout: AVATAR_FETCH_TIMEOUT,
      responseType: 'stream',
      redirect: 'manual',
      validateStatus: status => status >= 200 && status < 600,
      headers: { accept: AVATAR_ACCEPT },
    })
    if (!isAvatarRedirect(response.status)) return { response, sourceUrl: current.toString() }
    await cancelAvatarBody(response.data)
    const next = await resolveAvatarRedirect(current, response.headers.get('location'))
    if (!next) return
    current = next
  }
}

function isAvatarRedirect(status: number) {
  return status >= 300 && status < 400
}

async function resolveAvatarRedirect(base: URL, location: string | null) {
  if (!location) return
  let next: URL
  try {
    next = new URL(location, base)
  } catch {
    return
  }
  if (!['http:', 'https:'].includes(next.protocol)) return
  if (await isBlockedAvatarTarget(next)) return
  return next
}

async function readLimitedAvatarBody(stream: AvatarBodyStream) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      size += value.byteLength
      if (size > AVATAR_MAX_SIZE) {
        await reader.cancel().catch(() => {})
        return
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), size)
}

async function cancelAvatarBody(stream?: AvatarBodyStream) {
  await stream?.cancel?.().catch(() => {})
}

function isAvatarCacheLikelyDefault(url: string, key: string) {
  try {
    const parsed = new URL(url)
    const hostname = normalizeAvatarHostname(parsed.hostname)
    const isGravatarHost = ['cravatar.cn', 'www.cravatar.cn', 's.gravatar.com', 'gravatar.com', 'www.gravatar.com'].includes(hostname)
    if (!isGravatarHost) return false
    if (getAvatarDefaultMode(parsed)) return true
    if (!key.startsWith('gravatar:')) return false
    const mode = (parsed.searchParams.get('d') || parsed.searchParams.get('default') || '').trim().toLowerCase()
    return mode !== '404'
  } catch {
    return false
  }
}

function getAvatarDefaultMode(url: URL) {
  const value = url.searchParams.get('d') || url.searchParams.get('default') || ''
  const normalized = value.trim().toLowerCase()
  return normalized && AVATAR_DEFAULT_HINTS.has(normalized) ? normalized : ''
}

function isAvatarDefaultResponse(headers: Headers) {
  const from = headers.get('avatar-from')?.trim().toLowerCase()
  return from === 'default' || from === 'mp'
}

async function isBlockedAvatarTarget(url: URL) {
  const hostname = normalizeAvatarHostname(url.hostname)
  if (!hostname || AVATAR_BLOCKED_HOSTS.has(hostname)) return true
  if (isAllowedAvatarHost(hostname)) return false
  const directIp = isIP(hostname)
  if (directIp) return isPrivateAddress(hostname, directIp)
  try {
    const records = await lookup(hostname, { all: true, verbatim: false })
    if (!records.length) return true
    return records.some(record => isPrivateAddress(record.address, record.family))
  } catch {
    return true
  }
}

function isAllowedAvatarHost(hostname: string) {
  return AVATAR_ALLOWED_HOSTS.has(hostname)
}

function normalizeAvatarHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1').replace(/\.$/, '')
}

function isPrivateAddress(address: string, family = isIP(address)) {
  if (family === 4) {
    const parts = address.split('.').map(part => Number(part))
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
    const [a, b] = parts
    return a === 0
      || a === 10
      || a === 127
      || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31
      || a === 192 && b === 168
      || a >= 224
  }
  if (family === 6) {
    const value = address.toLowerCase()
    const first = Number.parseInt(value.split(':')[0] || '0', 16)
    return value === '::1'
      || value === '::'
      || value.startsWith('::ffff:')
      || (Number.isFinite(first) && (first & 0xffc0) === 0xfe80)
      || value.startsWith('fc')
      || value.startsWith('fd')
      || value.startsWith('ff')
  }
  return true
}

export function startAvatarCacheMaintenance(ctx: Context) {
  void cleanupAvatarDiskCache(ctx)
  const timer = setInterval(() => cleanupAvatarCaches(ctx), AVATAR_CACHE_SWEEP_INTERVAL)
  return () => {
    clearInterval(timer)
    avatarCache.clear()
  }
}

import { Context } from 'koishi'
import { createHash } from 'crypto'
import { promisify } from 'util'
import { gzip as gzipCallback } from 'zlib'
import type {
  MarketLookupRequest,
  MarketLookupResult,
  MarketProvider,
  MarketSnapshotTransfer,
} from '../shared'

const gzip = promisify(gzipCallback)
const MAX_MARKET_SNAPSHOTS = 6
const EMPTY_MARKET_DATA = {}

interface EncodedMarketSnapshot {
  id: string
  body: Buffer
  decodedSize: number
  encodedSize: number
}

interface MarketSnapshotMemo {
  version: number | undefined
  task: Promise<EncodedMarketSnapshot>
}

export class MarketSnapshotTransport {
  private tasks = new Map<string, Promise<EncodedMarketSnapshot>>()
  private entries = new Map<string, EncodedMarketSnapshot>()
  private memos = new WeakMap<object, MarketSnapshotMemo>()

  constructor(private ctx: Context, private route: string) {}

  async create(snapshot: MarketProvider.Payload): Promise<MarketSnapshotTransfer> {
    const data = snapshot.data ?? EMPTY_MARKET_DATA
    let memo = this.memos.get(data)
    const reused = !!memo && memo.version === snapshot.dataVersion
    if (!reused) {
      const task = this.prepare(data)
      memo = { version: snapshot.dataVersion, task }
      this.memos.set(data, memo)
      void task.catch(() => {
        if (this.memos.get(data) === memo) this.memos.delete(data)
      })
    }
    const entry = await memo!.task
    this.remember(entry)
    if (reused) {
      this.ctx.logger('market').debug(`reused console market snapshot: id=${entry.id}, decoded=${entry.decodedSize}, gzip=${entry.encodedSize}`)
    }
    const { data: _, ...payload } = snapshot
    return {
      transport: 'http-gzip',
      url: `${this.route}/${entry.id}`,
      payload,
      decodedSize: entry.decodedSize,
      encodedSize: entry.encodedSize,
    }
  }

  get(id: string) {
    return this.entries.get(id)
  }

  clear() {
    this.tasks.clear()
    this.entries.clear()
    this.memos = new WeakMap()
  }

  private async prepare(data: object) {
    const json = JSON.stringify(data)
    const id = createHash('sha256').update(json).digest('hex')
    const entry = this.entries.get(id)
    if (entry) return entry
    let task = this.tasks.get(id)
    if (!task) {
      task = this.encode(id, json).finally(() => this.tasks.delete(id))
      this.tasks.set(id, task)
    }
    return task
  }

  private async encode(id: string, json: string) {
    const start = Date.now()
    const decodedSize = Buffer.byteLength(json)
    const body = await gzip(Buffer.from(json), { level: 6 }) as Buffer
    const entry = { id, body, decodedSize, encodedSize: body.length }
    this.remember(entry)
    this.ctx.logger('market').debug(`prepared console market snapshot: id=${id}, decoded=${decodedSize}, gzip=${body.length}, elapsed=${Date.now() - start}ms`)
    return entry
  }

  private remember(entry: EncodedMarketSnapshot) {
    this.entries.delete(entry.id)
    this.entries.set(entry.id, entry)
    while (this.entries.size > MAX_MARKET_SNAPSHOTS) {
      const oldest = this.entries.keys().next().value
      if (!oldest) break
      this.entries.delete(oldest)
    }
  }
}

function normalizeMarketLookupValues(values: unknown, limit: number) {
  if (!Array.isArray(values)) return []
  return Array.from(new Set(values
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim())
    .filter(value => value && value.length <= 214)))
    .slice(0, limit)
}

export async function lookupMarket(provider: MarketProvider | undefined, request: MarketLookupRequest = {}): Promise<MarketLookupResult> {
  if (!request || typeof request !== 'object') request = {}
  const names = normalizeMarketLookupValues(request.names, 512)
  const services = normalizeMarketLookupValues(request.services, 128)
  const result: MarketLookupResult = {
    data: {},
    services: Object.fromEntries(services.map(name => [name, []])),
  }
  if (!provider || !names.length && !services.length) return result

  const snapshot = await provider.getSnapshot()
  const data = snapshot?.data ?? {}
  result.dataVersion = snapshot?.dataVersion
  for (const name of names) {
    if (data[name]) result.data[name] = data[name]
  }
  if (!services.length) return result

  const requestedServices = new Set(services)
  for (const object of Object.values(data)) {
    const implemented = object?.manifest?.service?.implements
    if (!Array.isArray(implemented)) continue
    for (const service of implemented) {
      if (!requestedServices.has(service)) continue
      result.services[service].push(object.package.name)
    }
  }
  for (const service of services) result.services[service].sort()
  return result
}

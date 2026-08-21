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

interface EncodedMarketSnapshot {
  id: string
  body: Buffer
  decodedSize: number
  encodedSize: number
}

export class MarketSnapshotTransport {
  private tasks = new Map<string, Promise<EncodedMarketSnapshot>>()
  private entries = new Map<string, EncodedMarketSnapshot>()

  constructor(private ctx: Context, private route: string) {}

  async create(snapshot: MarketProvider.Payload): Promise<MarketSnapshotTransfer> {
    const data = snapshot.data ?? {}
    const json = JSON.stringify(data)
    const id = createHash('sha256').update(json).digest('hex')
    let entry = this.entries.get(id)
    if (!entry) {
      let task = this.tasks.get(id)
      if (!task) {
        task = this.encode(id, json).finally(() => this.tasks.delete(id))
        this.tasks.set(id, task)
      }
      entry = await task
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
  }

  private async encode(id: string, json: string) {
    const start = Date.now()
    const decodedSize = Buffer.byteLength(json)
    const body = await gzip(Buffer.from(json), { level: 6 }) as Buffer
    const entry = { id, body, decodedSize, encodedSize: body.length }
    this.entries.set(id, entry)
    while (this.entries.size > MAX_MARKET_SNAPSHOTS) {
      const oldest = this.entries.keys().next().value
      if (!oldest) break
      this.entries.delete(oldest)
    }
    this.ctx.logger('market').debug(`prepared console market snapshot: id=${id}, decoded=${decodedSize}, gzip=${body.length}, elapsed=${Date.now() - start}ms`)
    return entry
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

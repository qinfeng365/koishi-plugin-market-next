import { Awaitable, Context, Dict, Logger, Time } from 'koishi'
import { DataService } from '@koishijs/console'
import { SearchObject, SearchResult } from '@koishijs/registry'

declare module '@koishijs/console' {
  interface Events {
    'market/refresh'(): Promise<void>
  }

  namespace Console {
    interface Services {
      market: MarketProvider
    }
  }
}

const logger = new Logger('market')

export abstract class MarketProvider extends DataService<MarketProvider.Payload> {
  protected _task: Promise<any>
  private _timestamp = 0
  protected _error: any

  constructor(ctx: Context) {
    super(ctx, 'market', { authority: 4 })

    ctx.console.addListener('market/refresh', async () => {
      await this.start(true)
    }, { authority: 4 })

    ctx.on('console/connection', async (client) => {
      if (!ctx.console.clients[client.id]) return
      if (Date.now() - this._timestamp <= Time.hour * 12) return
      if (await this.ctx.serial('console/intercept', client, { authority: 4 })) return
      this.start()
    })
  }

  async start(refresh = false): Promise<void> {
    this._task = null
    this._error = null
    this._timestamp = Date.now()
    await this.refresh()
  }

  abstract collect(): Promise<void | SearchResult>

  async prepare(): Promise<SearchResult> {
    return this._task ||= this.collect().catch((error) => {
      if (error?.message !== 'market provider disposed') logger.warn(error)
      this._error = error
      this._task = null
    })
  }
}

export namespace MarketProvider {
  export interface Payload {
    registry?: string
    data: Dict<SearchObject>
    total: number
    failed: number
    progress: number
    gravatar?: string
    stale?: boolean
    error?: string
  }
}

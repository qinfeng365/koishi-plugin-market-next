import { tool } from '@langchain/core/tools'
import { Context, HTTP, Time } from 'koishi'
import type { SearchResult } from '@koishijs/registry'
import { DEFAULT_ENDPOINT } from './market'
import {
  CHATLUNA_TOOL_NAME,
  formatLoadError,
  formatSearchResult,
  normalizeInput,
  searchSchema,
  type LoadResult,
  type MarketIndex,
  type MarketObject,
  type SearchInput,
} from './chatluna-search'

const CACHE_TTL = Time.minute * 10

interface ChatLunaService {
  platform?: {
    registerTool(name: string, tool: ChatLunaToolRegistration): () => void
  }
}

interface ChatLunaToolRegistration {
  description?: string
  selector(history: unknown[]): boolean
  authorization?(session: unknown): boolean
  meta?: {
    source?: string
    group?: string
    tags?: string[]
    defaultAvailability?: {
      enabled?: boolean
      main?: boolean
      chatluna?: boolean
      characterScope?: 'all' | 'group' | 'private' | 'none'
    }
  }
  createTool(params?: unknown): unknown
}

export interface ChatLunaToolConfig {
  chatlunaTool?: boolean
  search?: {
    endpoint?: string
    timeout?: number
    proxyAgent?: string
  }
}

const cache: Record<string, MarketIndex> = {}
const pending: Record<string, Promise<MarketIndex>> = {}

const description = `Search the Koishi plugin market / 查询 Koishi 插件市场。

Use this read-only tool whenever the user wants to find, recommend, compare, inspect, or rank Koishi plugins. 适用场景包括：插件搜索、插件推荐、插件对比、最近新增、最近更新、热门插件、认证插件、风险/不安全/废弃状态查询。

Prefer calling this tool before answering questions like "有没有 onebot 插件", "推荐一个 AI 插件", "最近新增了什么插件", "哪些插件有风险", "compare these Koishi plugins", or "find a stable adapter".

Return value is JSON. The tool only reads the market registry index. It never installs, uninstalls, updates, edits configuration, or modifies package.json.`

export function applyChatLunaTool(ctx: Context, config: ChatLunaToolConfig = {}) {
  if (!config.chatlunaTool) return

  const logger = ctx.logger('market')
  logger.debug('ChatLuna market search tool is enabled; waiting for chatluna service')

  ctx.inject(['chatluna'], (ctx) => {
    const marketTool = createMarketTool(ctx, config)

    ctx.effect(() => {
      const chatluna = ctx.get('chatluna') as ChatLunaService | undefined
      const registerTool = chatluna?.platform?.registerTool
      if (!registerTool) {
        ctx.logger('market').warn('ChatLuna platform service is missing, skip market search tool')
        return () => {}
      }

      try {
        const dispose = registerTool.call(chatluna.platform, CHATLUNA_TOOL_NAME, {
          description: marketTool.description,
          selector: () => true,
          meta: {
            source: 'extension',
            group: 'market',
            tags: ['market', 'koishi', 'plugin', 'search', 'recommend'],
            defaultAvailability: {
              enabled: true,
              main: true,
              chatluna: true,
              characterScope: 'all',
            },
          },
          createTool: () => marketTool,
        })

        ctx.logger('market').info(`ChatLuna market search tool registered: ${CHATLUNA_TOOL_NAME}`)
        return () => {
          ctx.logger('market').debug(`ChatLuna market search tool disposed: ${CHATLUNA_TOOL_NAME}`)
          dispose?.()
        }
      } catch (error) {
        ctx.logger('market').warn(`Failed to register ChatLuna market search tool: ${formatError(error)}`)
        return () => {}
      }
    })
  })
}

function createMarketTool(ctx: Context, config: ChatLunaToolConfig) {
  return tool(async (input: SearchInput) => {
    const normalized = normalizeInput(input ?? {})
    try {
      const result = await loadIndex(ctx, config)
      return formatSearchResult(result, normalized)
    } catch (error) {
      return formatLoadError(resolveEndpoint(config), normalized, error)
    }
  }, {
    name: CHATLUNA_TOOL_NAME,
    description,
    schema: searchSchema,
  })
}

async function loadIndex(ctx: Context, config: ChatLunaToolConfig): Promise<LoadResult> {
  const endpoint = resolveEndpoint(config)
  const now = Date.now()
  const cached = cache[endpoint]

  if (cached && now - cached.fetchedAt < CACHE_TTL) {
    return { index: cached, stale: false }
  }

  try {
    pending[endpoint] ||= fetchIndex(ctx, config)
    const index = await pending[endpoint]
    cache[endpoint] = index
    return { index, stale: false }
  } catch (error) {
    if (cached) {
      return { index: cached, stale: true, error: formatError(error) }
    }
    throw error
  } finally {
    delete pending[endpoint]
  }
}

async function fetchIndex(ctx: Context, config: ChatLunaToolConfig): Promise<MarketIndex> {
  const endpoint = resolveEndpoint(config)
  const http: HTTP = ctx.http.extend({
    endpoint,
    timeout: config.search?.timeout ?? Time.second * 30,
    proxyAgent: config.search?.proxyAgent,
  } as HTTP.Config)
  const result = await http.get<SearchResult>('')
  return {
    endpoint,
    fetchedAt: Date.now(),
    version: result.version,
    objects: result.objects as MarketObject[],
  }
}

function resolveEndpoint(config: ChatLunaToolConfig) {
  return config.search?.endpoint || DEFAULT_ENDPOINT
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

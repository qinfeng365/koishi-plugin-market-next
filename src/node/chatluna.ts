import { tool } from '@langchain/core/tools'
import { Context, HTTP, Time } from 'koishi'
import { SearchObject, SearchResult } from '@koishijs/registry'
import z from 'zod'
import { DEFAULT_ENDPOINT } from './market'

const TOOL_NAME = 'koishi_plugin_market_search'
const CACHE_TTL = Time.minute * 10
const DAY = Time.day

const statusValues = ['verified', 'insecure', 'preview', 'portable', 'deprecated'] as const
const sortValues = ['relevance', 'rating', 'downloads', 'created', 'updated'] as const
const orderValues = ['asc', 'desc'] as const

type Status = typeof statusValues[number]
type Sort = typeof sortValues[number]

type MarketObject = SearchObject & {
  deprecated?: string
}

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

interface MarketIndex {
  endpoint: string
  fetchedAt: number
  version?: number
  objects: MarketObject[]
}

interface LoadResult {
  index: MarketIndex
  stale: boolean
  error?: string
}

const cache: Record<string, MarketIndex> = {}
const pending: Record<string, Promise<MarketIndex>> = {}

const searchSchema = z.object({
  query: z.string().optional().describe('Keyword search. Matches plugin package name, short name, description, and keywords.'),
  category: z.array(z.string()).optional().describe('Category filter, for example adapter, ai, tool, game, webui. Multiple values match any category.'),
  status: z.array(z.enum(statusValues)).optional().describe('Status filter: verified, insecure, preview, portable, deprecated. Multiple values match any status.'),
  createdAfter: z.string().optional().describe('Only include plugins created on or after this date. Supports YYYY-MM-DD or ISO date.'),
  createdBefore: z.string().optional().describe('Only include plugins created on or before this date. Supports YYYY-MM-DD or ISO date.'),
  updatedAfter: z.string().optional().describe('Only include plugins updated on or after this date. Supports YYYY-MM-DD or ISO date.'),
  updatedBefore: z.string().optional().describe('Only include plugins updated on or before this date. Supports YYYY-MM-DD or ISO date.'),
  createdWithinDays: z.number().int().positive().optional().describe('Only include plugins created within the last N days.'),
  updatedWithinDays: z.number().int().positive().optional().describe('Only include plugins updated within the last N days.'),
  sort: z.enum(sortValues).default('relevance').describe('Sort mode.'),
  order: z.enum(orderValues).default('desc').describe('Sort order.'),
  limit: z.number().int().min(1).max(50).default(10).describe('Maximum number of results to show, from 1 to 50.'),
  includeHidden: z.boolean().optional().describe('Include ignored or hidden plugins. Defaults to false.'),
  includeDeprecated: z.boolean().optional().describe('Include deprecated plugins. Defaults to false unless status includes deprecated.'),
})

type SearchInput = z.infer<typeof searchSchema>

const description = `Search the Koishi plugin market.

Use this read-only tool when the user asks to find Koishi plugins by keyword, category, status, created/updated time range, recent additions, recent updates, downloads, rating, or market metadata.

The tool only reads the market registry index. It does not install, uninstall, update, edit configuration, or modify package.json.`

export function applyChatLunaTool(ctx: Context, config: ChatLunaToolConfig = {}) {
  if (!config.chatlunaTool) return

  ctx.inject(['chatluna'], (ctx) => {
    const marketTool = createMarketTool(ctx, config)

    ctx.effect(() => {
      const chatluna = ctx.get('chatluna') as ChatLunaService | undefined
      const registerTool = chatluna?.platform?.registerTool
      if (!registerTool) {
        ctx.logger('market').warn('ChatLuna platform service is missing, skip market search tool')
        return () => {}
      }

      return registerTool.call(chatluna.platform, TOOL_NAME, {
        description: marketTool.description,
        selector: () => true,
        meta: {
          source: 'extension',
          group: 'market',
          tags: ['market', 'koishi', 'plugin'],
          defaultAvailability: {
            enabled: true,
            main: true,
            chatluna: true,
            characterScope: 'all',
          },
        },
        createTool: () => marketTool,
      })
    })
  })
}

function createMarketTool(ctx: Context, config: ChatLunaToolConfig) {
  return tool(async (input: SearchInput) => {
    try {
      const result = await loadIndex(ctx, config)
      return formatSearchResult(result, input)
    } catch (error) {
      return formatLoadError(resolveEndpoint(config), error)
    }
  }, {
    name: TOOL_NAME,
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

function formatSearchResult(result: LoadResult, input: SearchInput) {
  const { index } = result
  const filtered = filterObjects(index.objects, input)
  const sorted = sortObjects(filtered, input)
  const shown = sorted.slice(0, input.limit)
  const lines = [
    '# Koishi 插件市场查询结果',
    '',
    `- Registry: ${index.endpoint}`,
    `- 索引时间: ${formatDateTime(index.fetchedAt)}${result.stale ? '（缓存）' : ''}`,
    `- 命中数: ${filtered.length}`,
    `- 展示数: ${shown.length}`,
    `- 筛选条件: ${formatFilters(input)}`,
  ]

  if (result.stale) {
    lines.push(`- 警告: 获取最新市场索引失败，正在使用旧缓存。原因：${result.error}`)
  }

  if (!shown.length) {
    lines.push('', '没有找到符合条件的插件。可以放宽关键词、时间范围、分类或状态过滤。')
    return lines.join('\n')
  }

  shown.forEach((item, index) => {
    lines.push('', formatItem(item, index + 1))
  })

  return lines.join('\n')
}

function filterObjects(objects: MarketObject[], input: SearchInput) {
  const terms = getQueryTerms(input.query)
  const categories = new Set(input.category?.map(normalizeText).filter(Boolean))
  const statuses = input.status ?? []
  const includeDeprecated = input.includeDeprecated || statuses.includes('deprecated')
  const createdAfter = input.createdWithinDays
    ? Date.now() - input.createdWithinDays * DAY
    : parseDate(input.createdAfter, false)
  const createdBefore = parseDate(input.createdBefore, true)
  const updatedAfter = input.updatedWithinDays
    ? Date.now() - input.updatedWithinDays * DAY
    : parseDate(input.updatedAfter, false)
  const updatedBefore = parseDate(input.updatedBefore, true)

  return objects.filter((item) => {
    if (!input.includeHidden && (item.ignored || item.manifest?.hidden)) return false
    if (!includeDeprecated && isDeprecated(item)) return false
    if (categories.size && !categories.has(resolveCategory(item.category))) return false
    if (statuses.length && !statuses.some(status => hasStatus(item, status))) return false
    if (terms.length && !terms.every(term => relevancePart(item, term) > 0)) return false

    const createdAt = parseItemDate(item.createdAt)
    const updatedAt = parseItemDate(item.updatedAt)
    if (createdAfter && (!createdAt || createdAt < createdAfter)) return false
    if (createdBefore && (!createdAt || createdAt > createdBefore)) return false
    if (updatedAfter && (!updatedAt || updatedAt < updatedAfter)) return false
    if (updatedBefore && (!updatedAt || updatedAt > updatedBefore)) return false

    return true
  })
}

function sortObjects(objects: MarketObject[], input: SearchInput) {
  const terms = getQueryTerms(input.query)
  const order = input.order === 'asc' ? 1 : -1
  return objects.slice().sort((a, b) => {
    const delta = compareObject(a, b, input.sort, terms)
    if (delta) return delta * order
    return a.package.name.localeCompare(b.package.name)
  })
}

function compareObject(a: MarketObject, b: MarketObject, sort: Sort, terms: string[]) {
  if (sort === 'rating') return (a.rating ?? 0) - (b.rating ?? 0)
  if (sort === 'downloads') return (a.downloads?.lastMonth ?? 0) - (b.downloads?.lastMonth ?? 0)
  if (sort === 'created') return (parseItemDate(a.createdAt) ?? 0) - (parseItemDate(b.createdAt) ?? 0)
  if (sort === 'updated') return (parseItemDate(a.updatedAt) ?? 0) - (parseItemDate(b.updatedAt) ?? 0)
  return relevanceScore(a, terms) - relevanceScore(b, terms)
}

function relevanceScore(item: MarketObject, terms: string[]) {
  if (!terms.length) return item.rating ?? 0
  return terms.reduce((sum, term) => sum + relevancePart(item, term), 0) + (item.rating ?? 0)
}

function relevancePart(item: MarketObject, term: string) {
  const name = normalizeText(item.package.name)
  const shortname = normalizeText(item.shortname)
  const normalizedName = normalizePackageName(name)
  const description = normalizeText(getDescription(item))
  const keywords = item.package.keywords?.map(normalizeText) ?? []

  if (shortname === term || normalizedName === term) return 100
  if (name === term) return 95
  if (shortname.startsWith(term) || normalizedName.startsWith(term)) return 75
  if (shortname.includes(term) || normalizedName.includes(term)) return 55
  if (name.includes(term)) return 45
  if (keywords.some(keyword => keyword === term)) return 35
  if (keywords.some(keyword => keyword.includes(term))) return 20
  if (description.includes(term)) return 10
  return 0
}

function formatItem(item: MarketObject, index: number) {
  const pkg = item.package
  const links = getLinks(item)
  const maintainers = pkg.maintainers?.slice(0, 3).map(user => user.username || user.name || user.email).filter(Boolean)
  const lines = [
    `## ${index}. ${item.shortname || pkg.name}`,
    `- 包名: \`${pkg.name}\``,
    `- 版本: \`${pkg.version}\``,
    `- 分类: ${resolveCategory(item.category)}`,
    `- 评分: ${formatNumber(item.rating ?? 0)}`,
    `- 月下载: ${formatInteger(item.downloads?.lastMonth ?? 0)}`,
    `- 创建时间: ${formatDate(item.createdAt)}`,
    `- 更新时间: ${formatDate(item.updatedAt)}`,
    `- 状态标签: ${getStatusTags(item).join(', ') || 'normal'}`,
  ]

  if (maintainers?.length) {
    lines.push(`- 维护者: ${maintainers.join(', ')}`)
  }

  lines.push(
    `- 简介: ${truncate(getDescription(item), 220) || '暂无简介。'}`,
    `- 链接: ${links.join(' / ')}`,
  )

  return lines.join('\n')
}

function getLinks(item: MarketObject) {
  const name = item.package.name
  const links = item.package.links ?? {}
  const result = [`[npm](${links.npm || `https://www.npmjs.com/package/${name}`})`]
  const homepage = links.homepage || links.repository
  if (homepage) result.push(`[homepage](${homepage.replace(/^git\+/, '').replace(/\.git$/, '')})`)
  return result
}

function getStatusTags(item: MarketObject) {
  const tags: string[] = []
  if (item.verified) tags.push('verified')
  if (item.insecure || item.manifest?.insecure) tags.push('insecure')
  if (item.manifest?.preview) tags.push('preview')
  if (item.portable) tags.push('portable')
  if (isDeprecated(item)) tags.push('deprecated')
  if (item.workspace) tags.push('workspace')
  if (item.ignored) tags.push('ignored')
  if (item.manifest?.hidden) tags.push('hidden')
  return tags
}

function hasStatus(item: MarketObject, status: Status) {
  if (status === 'verified') return !!item.verified
  if (status === 'insecure') return !!item.insecure || !!item.manifest?.insecure
  if (status === 'preview') return !!item.manifest?.preview
  if (status === 'portable') return !!item.portable
  if (status === 'deprecated') return isDeprecated(item)
}

function isDeprecated(item: MarketObject) {
  return !!(item.deprecated || item.package.deprecated)
}

function getDescription(item: MarketObject) {
  const description = item.manifest?.description
  if (typeof description === 'string') return cleanText(description)
  if (description) {
    return cleanText(description['zh-CN'] || description['en-US'] || Object.values(description)[0])
  }
  return cleanText(item.package.description)
}

function formatFilters(input: SearchInput) {
  const filters: string[] = []
  if (input.query) filters.push(`关键词=${input.query}`)
  if (input.category?.length) filters.push(`分类=${input.category.join(', ')}`)
  if (input.status?.length) filters.push(`状态=${input.status.join(', ')}`)
  if (input.createdAfter) filters.push(`创建晚于=${input.createdAfter}`)
  if (input.createdBefore) filters.push(`创建早于=${input.createdBefore}`)
  if (input.updatedAfter) filters.push(`更新晚于=${input.updatedAfter}`)
  if (input.updatedBefore) filters.push(`更新早于=${input.updatedBefore}`)
  if (input.createdWithinDays) filters.push(`最近新增=${input.createdWithinDays}天`)
  if (input.updatedWithinDays) filters.push(`最近更新=${input.updatedWithinDays}天`)
  if (input.includeHidden) filters.push('包含隐藏')
  if (input.includeDeprecated) filters.push('包含废弃')
  filters.push(`排序=${input.sort}/${input.order}`, `限制=${input.limit}`)
  return filters.join('; ')
}

function formatLoadError(endpoint: string, error: unknown) {
  return [
    '# Koishi 插件市场查询失败',
    '',
    `- Registry: ${endpoint}`,
    `- 原因: ${formatError(error)}`,
    '',
    '请检查 market.search.endpoint、market.search.timeout 配置或当前网络连接。此工具只读查询市场索引，不会修改本地配置。',
  ].join('\n')
}

function parseDate(value?: string, endOfDay = false) {
  if (!value) return 0
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
    return Date.parse(trimmed + suffix) || 0
  }
  return Date.parse(trimmed) || 0
}

function parseItemDate(value?: string) {
  if (!value) return 0
  return Date.parse(value) || 0
}

function resolveEndpoint(config: ChatLunaToolConfig) {
  return config.search?.endpoint || DEFAULT_ENDPOINT
}

function resolveCategory(category?: string) {
  return normalizeText(category) || 'other'
}

function normalizePackageName(name: string) {
  return name.replace(/^(koishi-|@koishijs\/)plugin-/, '')
}

function normalizeText(value?: string) {
  return (value ?? '').toLowerCase().trim()
}

function getQueryTerms(query?: string) {
  return normalizeText(query).split(/\s+/).filter(Boolean)
}

function cleanText(value?: string) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function truncate(value: string, length: number) {
  if (value.length <= length) return value
  return value.slice(0, length - 1).trimEnd() + '...'
}

function formatDateTime(value: number) {
  return new Date(value).toISOString()
}

function formatDate(value?: string) {
  const timestamp = parseItemDate(value)
  if (!timestamp) return 'unknown'
  return new Date(timestamp).toISOString().slice(0, 10)
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00'
}

function formatInteger(value: number) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '0'
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

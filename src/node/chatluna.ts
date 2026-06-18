import { tool } from '@langchain/core/tools'
import { Context, HTTP, Time } from 'koishi'
import { SearchObject, SearchResult } from '@koishijs/registry'
import z from 'zod'
import { DEFAULT_ENDPOINT } from './market'

const TOOL_NAME = 'koishi_plugin_market_search'
const CACHE_TTL = Time.minute * 10
const DAY = Time.day

const intentValues = ['search', 'recommend', 'recent', 'popular', 'risk', 'compare'] as const
const statusValues = ['verified', 'insecure', 'preview', 'portable', 'deprecated'] as const
const sortValues = ['relevance', 'downloads', 'created', 'updated'] as const
const orderValues = ['asc', 'desc'] as const

type Intent = typeof intentValues[number]
type Status = typeof statusValues[number]
type Sort = typeof sortValues[number]
type Order = typeof orderValues[number]

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

interface NormalizedSearchInput {
  intent: Intent
  query?: string
  requirements?: string
  names: string[]
  category: string[]
  status: Status[]
  createdAfter?: string
  createdBefore?: string
  updatedAfter?: string
  updatedBefore?: string
  createdWithinDays?: number
  updatedWithinDays?: number
  sort: Sort
  order: Order
  limit: number
  includeHidden: boolean
  includeDeprecated: boolean
}

interface SearchPayload {
  tool: typeof TOOL_NAME
  registry: string
  fetchedAt: string | null
  stale: boolean
  error: string | null
  intent: Intent
  filters: Record<string, unknown>
  total: number
  matched: number
  returned: number
  summary: {
    text: string
    warnings: string[]
    risk: Record<string, number>
  }
  results: SearchResultItem[]
  nextQueries: string[]
}

interface SearchResultItem {
  rank: number
  name: string
  shortname: string
  version: string
  category: string
  downloadsLastMonth: number
  createdAt: string | null
  updatedAt: string | null
  statusTags: string[]
  description: string
  links: {
    npm: string
    homepage?: string
    repository?: string
  }
  reasons: string[]
}

const cache: Record<string, MarketIndex> = {}
const pending: Record<string, Promise<MarketIndex>> = {}

const searchSchema = z.object({
  intent: z.enum(intentValues).optional().describe('Search intent. Use recommend for plugin recommendations, recent for newly created plugins, popular for high-download plugins, risk for insecure/deprecated plugins, and compare for comparing named plugins.'),
  query: z.string().optional().describe('Keyword search. Matches plugin package name, short name, description, and keywords.'),
  requirements: z.string().optional().describe('Natural language user requirements, for example "找一个好用的 onebot 适配器" or "recommend a stable AI plugin".'),
  names: stringList('Plugin package names or short names for exact lookup or comparison. Accepts an array, a single string, or comma-separated names.'),
  category: stringList('Category filter, for example adapter, ai, tool, game, webui. Accepts an array, a single string, or comma-separated categories.'),
  status: statusList(),
  createdAfter: z.string().optional().describe('Only include plugins created on or after this date. Supports YYYY-MM-DD or ISO date.'),
  createdBefore: z.string().optional().describe('Only include plugins created on or before this date. Supports YYYY-MM-DD or ISO date.'),
  updatedAfter: z.string().optional().describe('Only include plugins updated on or after this date. Supports YYYY-MM-DD or ISO date.'),
  updatedBefore: z.string().optional().describe('Only include plugins updated on or before this date. Supports YYYY-MM-DD or ISO date.'),
  createdWithinDays: z.number().int().positive().optional().describe('Only include plugins created within the last N days.'),
  updatedWithinDays: z.number().int().positive().optional().describe('Only include plugins updated within the last N days.'),
  sort: z.enum(sortValues).optional().describe('Sort mode. If omitted, the tool chooses a good default from intent.'),
  order: z.enum(orderValues).optional().describe('Sort order. Defaults to desc.'),
  limit: z.number().int().min(1).max(50).optional().describe('Maximum number of results to show, from 1 to 50. Defaults to 10.'),
  includeHidden: z.boolean().optional().describe('Include ignored or hidden plugins. Defaults to false.'),
  includeDeprecated: z.boolean().optional().describe('Include deprecated plugins. Defaults to false unless status includes deprecated or intent is risk.'),
})

type SearchInput = z.infer<typeof searchSchema>

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
        const dispose = registerTool.call(chatluna.platform, TOOL_NAME, {
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

        ctx.logger('market').info(`ChatLuna market search tool registered: ${TOOL_NAME}`)
        return () => {
          ctx.logger('market').debug(`ChatLuna market search tool disposed: ${TOOL_NAME}`)
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

function formatSearchResult(result: LoadResult, input: NormalizedSearchInput) {
  const { index } = result
  const filtered = filterObjects(index.objects, input)
  const sorted = sortObjects(filtered, input)
  const shown = sorted.slice(0, input.limit)
  const items = shown.map((item, index) => formatItem(item, index + 1, input))
  const payload: SearchPayload = {
    tool: TOOL_NAME,
    registry: index.endpoint,
    fetchedAt: formatDateTime(index.fetchedAt),
    stale: result.stale,
    error: result.error ?? null,
    intent: input.intent,
    filters: formatFilters(input),
    total: index.objects.length,
    matched: filtered.length,
    returned: items.length,
    summary: buildSummary(result, input, filtered, items),
    results: items,
    nextQueries: buildNextQueries(result, input, filtered.length, items.length),
  }
  return stringifyPayload(payload)
}

function filterObjects(objects: MarketObject[], input: NormalizedSearchInput) {
  const terms = getFilterTerms(input)
  const categories = new Set(input.category.map(normalizeText).filter(Boolean))
  const statuses = input.status
  const names = new Set(input.names.map(normalizeNameTarget).filter(Boolean))
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
    if (!input.includeDeprecated && isDeprecated(item)) return false
    if (names.size && !matchesName(item, names)) return false
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

function sortObjects(objects: MarketObject[], input: NormalizedSearchInput) {
  const terms = getQueryTerms(input)
  const order = input.order === 'asc' ? 1 : -1
  return objects.slice().sort((a, b) => {
    const delta = compareObject(a, b, input, terms)
    if (delta) return delta * order
    return a.package.name.localeCompare(b.package.name)
  })
}

function compareObject(a: MarketObject, b: MarketObject, input: NormalizedSearchInput, terms: string[]) {
  if (input.intent === 'risk' && input.sort === 'relevance') {
    return riskScore(a) - riskScore(b)
  }
  if (input.intent === 'recommend' && input.sort === 'relevance') {
    return recommendationScore(a, terms) - recommendationScore(b, terms)
  }
  if (input.sort === 'downloads') return (a.downloads?.lastMonth ?? 0) - (b.downloads?.lastMonth ?? 0)
  if (input.sort === 'created') return (parseItemDate(a.createdAt) ?? 0) - (parseItemDate(b.createdAt) ?? 0)
  if (input.sort === 'updated') return (parseItemDate(a.updatedAt) ?? 0) - (parseItemDate(b.updatedAt) ?? 0)
  return relevanceScore(a, terms) - relevanceScore(b, terms)
}

function normalizeInput(input: SearchInput): NormalizedSearchInput {
  const status = input.status ?? []
  const intent = inferIntent(input, status)
  const sort = input.sort ?? defaultSort(intent)
  const includeDeprecated = !!input.includeDeprecated || intent === 'risk' || status.includes('deprecated')
  return {
    intent,
    query: cleanText(input.query),
    requirements: cleanText(input.requirements),
    names: input.names ?? [],
    category: input.category?.map(resolveCategory).filter(Boolean) ?? [],
    status: intent === 'risk' && !status.length ? ['insecure', 'deprecated'] : status,
    createdAfter: input.createdAfter,
    createdBefore: input.createdBefore,
    updatedAfter: input.updatedAfter,
    updatedBefore: input.updatedBefore,
    createdWithinDays: input.createdWithinDays,
    updatedWithinDays: input.updatedWithinDays,
    sort,
    order: input.order ?? 'desc',
    limit: clamp(input.limit ?? 10, 1, 50),
    includeHidden: !!input.includeHidden,
    includeDeprecated,
  }
}

function inferIntent(input: SearchInput, status: Status[]): Intent {
  if (input.intent) return input.intent
  if (input.names?.length) return 'compare'
  if (status.some(status => status === 'insecure' || status === 'deprecated')) return 'risk'
  if (input.createdWithinDays || input.createdAfter || input.createdBefore) return 'recent'
  if (input.sort === 'downloads') return 'popular'
  if (input.requirements) return 'recommend'
  return 'search'
}

function defaultSort(intent: Intent): Sort {
  if (intent === 'recent') return 'created'
  if (intent === 'popular') return 'downloads'
  return 'relevance'
}

function recommendationScore(item: MarketObject, terms: string[]) {
  let score = relevanceScore(item, terms)
  score += Math.log10((item.downloads?.lastMonth ?? 0) + 1) * 8
  score += recencyScore(item.updatedAt)
  if (item.verified) score += 12
  if (item.insecure || item.manifest?.insecure) score -= 20
  if (isDeprecated(item)) score -= 30
  return score
}

function relevanceScore(item: MarketObject, terms: string[]) {
  if (!terms.length) return recencyScore(item.updatedAt)
  return terms.reduce((sum, term) => sum + relevancePart(item, term), 0) + recencyScore(item.updatedAt)
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

function riskScore(item: MarketObject) {
  let score = 0
  if (item.insecure || item.manifest?.insecure) score += 100
  if (isDeprecated(item)) score += 80
  if (item.manifest?.preview) score += 20
  return score
}

function recencyScore(value?: string) {
  const timestamp = parseItemDate(value)
  if (!timestamp) return 0
  const days = Math.max(0, (Date.now() - timestamp) / DAY)
  return Math.max(0, 12 - Math.log2(days + 1) * 2)
}

function formatItem(item: MarketObject, rank: number, input: NormalizedSearchInput): SearchResultItem {
  const pkg = item.package
  return {
    rank,
    name: pkg.name,
    shortname: item.shortname || normalizePackageName(pkg.name),
    version: pkg.version,
    category: resolveCategory(item.category),
    downloadsLastMonth: Math.round(pkgDownloads(item)),
    createdAt: formatDate(item.createdAt),
    updatedAt: formatDate(item.updatedAt),
    statusTags: getStatusTags(item),
    description: truncate(getDescription(item), 220),
    links: getLinks(item),
    reasons: getReasons(item, input),
  }
}

function getReasons(item: MarketObject, input: NormalizedSearchInput) {
  const reasons: string[] = []
  const terms = getQueryTerms(input)
  if (input.names.length && matchesName(item, new Set(input.names.map(normalizeNameTarget)))) reasons.push('matched requested plugin name')
  if (terms.some(term => relevancePart(item, term) >= 55)) reasons.push('strong keyword/name match')
  else if (terms.some(term => relevancePart(item, term) > 0)) reasons.push('matched description or keywords')
  if (input.category.includes(resolveCategory(item.category))) reasons.push(`matched category: ${resolveCategory(item.category)}`)
  if (item.verified) reasons.push('verified plugin')
  if (pkgDownloads(item) >= 1000) reasons.push('high monthly downloads')
  if (recencyScore(item.updatedAt) >= 8) reasons.push('recently updated')
  if (item.insecure || item.manifest?.insecure) reasons.push('marked insecure')
  if (isDeprecated(item)) reasons.push('marked deprecated')
  if (!reasons.length) reasons.push('included by current filters')
  return reasons
}

function buildSummary(result: LoadResult, input: NormalizedSearchInput, filtered: MarketObject[], items: SearchResultItem[]) {
  const warnings: string[] = []
  if (result.stale) warnings.push(`using stale cache: ${result.error}`)
  const risk = countRisk(filtered)
  if (risk.insecure) warnings.push(`${risk.insecure} matched plugin(s) are marked insecure`)
  if (risk.deprecated) warnings.push(`${risk.deprecated} matched plugin(s) are deprecated`)
  const top = items[0]?.name
  const text = top
    ? `${input.intent} matched ${filtered.length} plugin(s); top result is ${top}.`
    : `${input.intent} matched no plugins. Relax keyword, category, status, or date filters.`
  return { text, warnings, risk }
}

function buildNextQueries(result: LoadResult, input: NormalizedSearchInput, matched: number, returned: number) {
  const queries: string[] = []
  if (result.stale) queries.push('Retry after checking market.search.endpoint or network connectivity.')
  if (!matched) {
    queries.push('Try a shorter keyword or remove category/status filters.')
    if (input.intent !== 'recommend') queries.push('Use intent=recommend with requirements for broader matching.')
  } else if (matched > returned) {
    queries.push('Increase limit or add category/status filters to narrow the result set.')
  }
  if (input.intent !== 'popular') queries.push('Use intent=popular to see high-download alternatives.')
  if (input.intent !== 'risk') queries.push('Use intent=risk to inspect insecure or deprecated matches.')
  return queries
}

function countRisk(items: MarketObject[]) {
  return items.reduce<Record<string, number>>((result, item) => {
    if (item.insecure || item.manifest?.insecure) result.insecure += 1
    if (isDeprecated(item)) result.deprecated += 1
    if (item.manifest?.preview) result.preview += 1
    return result
  }, { insecure: 0, deprecated: 0, preview: 0 })
}

function getLinks(item: MarketObject) {
  const name = item.package.name
  const links = (item.package.links ?? {}) as Record<string, string | undefined>
  return {
    npm: cleanLink(links.npm) || `https://www.npmjs.com/package/${name}`,
    homepage: cleanLink(links.homepage),
    repository: cleanLink(links.repository),
  }
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

function matchesName(item: MarketObject, names: Set<string>) {
  const candidates = [
    item.package.name,
    item.shortname,
    normalizePackageName(item.package.name),
  ].map(normalizeNameTarget)
  return candidates.some(name => names.has(name))
}

function getDescription(item: MarketObject) {
  const description = item.manifest?.description
  if (typeof description === 'string') return cleanText(description)
  if (description) {
    return cleanText(description['zh-CN'] || description['en-US'] || String(Object.values(description)[0] ?? ''))
  }
  return cleanText(item.package.description)
}

function formatFilters(input: NormalizedSearchInput) {
  return {
    query: input.query || null,
    requirements: input.requirements || null,
    names: input.names,
    category: input.category,
    status: input.status,
    createdAfter: input.createdAfter ?? null,
    createdBefore: input.createdBefore ?? null,
    updatedAfter: input.updatedAfter ?? null,
    updatedBefore: input.updatedBefore ?? null,
    createdWithinDays: input.createdWithinDays ?? null,
    updatedWithinDays: input.updatedWithinDays ?? null,
    sort: input.sort,
    order: input.order,
    limit: input.limit,
    includeHidden: input.includeHidden,
    includeDeprecated: input.includeDeprecated,
  }
}

function formatLoadError(endpoint: string, input: NormalizedSearchInput, error: unknown) {
  const payload: SearchPayload = {
    tool: TOOL_NAME,
    registry: endpoint,
    fetchedAt: null,
    stale: false,
    error: formatError(error),
    intent: input.intent,
    filters: formatFilters(input),
    total: 0,
    matched: 0,
    returned: 0,
    summary: {
      text: 'Failed to load the Koishi plugin market index.',
      warnings: [formatError(error)],
      risk: { insecure: 0, deprecated: 0, preview: 0 },
    },
    results: [],
    nextQueries: [
      'Check market.search.endpoint, market.search.timeout, proxyAgent, or current network connectivity.',
      'If a previous call had stale=true, use its cached results until the registry is reachable.',
    ],
  }
  return stringifyPayload(payload)
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

function normalizeNameTarget(name?: string) {
  return normalizePackageName(normalizeText(name))
}

function normalizeText(value?: string) {
  return (value ?? '').toLowerCase().trim()
}

function getQueryTerms(input: NormalizedSearchInput) {
  return getTextTerms([input.query, input.requirements].filter(Boolean).join(' '))
}

function getFilterTerms(input: NormalizedSearchInput) {
  return getTextTerms(input.query)
}

function getTextTerms(value?: string) {
  const text = normalizeText(value)
  const words = text.split(/\s+/).filter(Boolean)
  const tokens = text.match(/[a-z0-9@/_-]+/g) ?? []
  return unique([...words, ...tokens].map(normalizeNameTarget).filter(Boolean))
}

function cleanText(value?: string) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function cleanLink(value?: string) {
  if (!value) return undefined
  return value.replace(/^git\+/, '').replace(/\.git$/, '')
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
  if (!timestamp) return null
  return new Date(timestamp).toISOString().slice(0, 10)
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function pkgDownloads(item: MarketObject) {
  return item.downloads?.lastMonth ?? 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

function stringifyPayload(payload: SearchPayload) {
  return JSON.stringify(payload, null, 2)
}

function stringList(description: string) {
  return z.preprocess((value) => normalizeList(value), z.array(z.string()).optional()).describe(description)
}

function statusList() {
  return z.preprocess((value) => {
    return normalizeList(value)?.map(normalizeStatus)
  }, z.array(z.enum(statusValues)).optional()).describe('Status filter: verified, insecure, preview, portable, deprecated. Accepts an array, a single string, or comma-separated status values.')
}

function normalizeList(value: unknown) {
  if (value == null || value === '') return undefined
  const values = Array.isArray(value) ? value : [value]
  return values.flatMap((item) => {
    if (typeof item !== 'string') return item
    return item.split(/[,，;；、\n]/g)
      .map(part => part.trim())
      .filter(Boolean)
  })
}

function normalizeStatus(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const status = normalizeText(value)
  const aliases: Record<string, Status> = {
    safe: 'verified',
    secure: 'verified',
    certified: 'verified',
    official: 'verified',
    verified: 'verified',
    认证: 'verified',
    已认证: 'verified',
    unsafe: 'insecure',
    risk: 'insecure',
    risky: 'insecure',
    insecure: 'insecure',
    不安全: 'insecure',
    风险: 'insecure',
    preview: 'preview',
    beta: 'preview',
    alpha: 'preview',
    预览: 'preview',
    portable: 'portable',
    可移植: 'portable',
    deprecated: 'deprecated',
    abandoned: 'deprecated',
    废弃: 'deprecated',
    已废弃: 'deprecated',
  }
  return aliases[status] ?? status
}

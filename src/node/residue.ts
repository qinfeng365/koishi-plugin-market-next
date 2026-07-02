import { Context, Dict } from 'koishi'
import { promises as fsp } from 'fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'path'

const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx'])
const MAX_SOURCE_FILES = 220
const MAX_SOURCE_FILE_SIZE = 512 * 1024
const MAX_SOURCE_TOTAL_SIZE = 3 * 1024 * 1024
const MAX_DIRECTORY_ENTRIES = 2500
const MAX_RESULT_ITEMS = 24

export interface ResidueDirectory {
  path: string
  relative: string
  size: number
  files: number
  modifiedAt?: number
  source: 'name' | 'source'
  removable: boolean
  truncated?: boolean
}

export interface ResidueAnalysis {
  name: string
  packageRoot?: string
  installed: boolean
  directories: ResidueDirectory[]
  databaseTables: string[]
  cacheKeys: string[]
  cleanupCommands: string[]
  sourcePaths: string[]
  warnings: string[]
}

export interface ResidueRemoveResult {
  removed: string[]
  failed: Array<{ path: string, error: string }>
}

interface SourceScanResult {
  databaseTables: string[]
  cacheKeys: string[]
  cleanupCommands: string[]
  sourcePaths: string[]
  warnings: string[]
}

export async function analyzePluginResidue(ctx: Context, names: string[]): Promise<ResidueAnalysis[]> {
  const unique = Array.from(new Set(names.filter(Boolean))).slice(0, 20)
  return Promise.all(unique.map(name => analyzeOnePluginResidue(ctx, name)))
}

export async function removeResiduePaths(ctx: Context, paths: string[]): Promise<ResidueRemoveResult> {
  const result: ResidueRemoveResult = { removed: [], failed: [] }
  for (const path of Array.from(new Set(paths.filter(Boolean))).slice(0, 50)) {
    try {
      const target = resolve(ctx.baseDir, path)
      if (!isSafeResiduePath(ctx, target)) {
        result.failed.push({ path, error: 'path is outside allowed data/cache directories' })
        continue
      }
      await fsp.rm(target, { recursive: true, force: true })
      result.removed.push(target)
    } catch (error) {
      result.failed.push({ path, error: formatError(error) })
    }
  }
  return result
}

async function analyzeOnePluginResidue(ctx: Context, name: string): Promise<ResidueAnalysis> {
  const packageRoot = resolvePackageRoot(name)
  const source = packageRoot ? await scanPackageSource(packageRoot) : {
    databaseTables: [],
    cacheKeys: [],
    cleanupCommands: [],
    sourcePaths: [],
    warnings: ['未找到已安装包源码，只能按包名扫描常见 data/cache 目录。'],
  }
  const pathHints = Array.from(new Set([
    ...getNamePathHints(name),
    ...source.sourcePaths,
  ])).slice(0, MAX_RESULT_ITEMS)
  const directories = await getExistingResidueDirectories(ctx, pathHints, source.sourcePaths)
  const warnings = [...source.warnings]
  if (source.databaseTables.length) {
    warnings.push('检测到数据库表线索。market-next 只展示表名，不会自动删除数据库数据。')
  }
  if (source.cleanupCommands.length) {
    warnings.push('检测到疑似清理命令。建议优先阅读插件文档，在卸载前由插件自身执行清理。')
  }
  return {
    name,
    packageRoot,
    installed: !!packageRoot,
    directories,
    databaseTables: source.databaseTables,
    cacheKeys: source.cacheKeys,
    cleanupCommands: source.cleanupCommands,
    sourcePaths: source.sourcePaths,
    warnings,
  }
}

function resolvePackageRoot(name: string) {
  try {
    return dirname(require.resolve(`${name}/package.json`))
  } catch {}
}

function getNamePathHints(name: string) {
  const keys = getPackageKeys(name)
  return keys.flatMap(key => [`data/${key}`, `cache/${key}`])
}

function getPackageKeys(name: string) {
  const parts = name.split('/')
  const unscoped = parts[parts.length - 1]
  const withoutPrefix = unscoped
    .replace(/^koishi-plugin-/, '')
    .replace(/^plugin-/, '')
  const scopedShort = name.startsWith('@') ? `${name.split('/')[0].slice(1)}-${withoutPrefix}` : ''
  return Array.from(new Set([
    sanitizePathKey(name),
    sanitizePathKey(unscoped),
    sanitizePathKey(withoutPrefix),
    sanitizePathKey(scopedShort),
  ].filter(Boolean)))
}

function sanitizePathKey(value: string) {
  return value
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^0-9a-z._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

async function scanPackageSource(packageRoot: string): Promise<SourceScanResult> {
  const files = await collectSourceFiles(packageRoot)
  const result: SourceScanResult = {
    databaseTables: [],
    cacheKeys: [],
    cleanupCommands: [],
    sourcePaths: [],
    warnings: [],
  }
  let totalSize = 0
  for (const file of files) {
    const stat = await fsp.stat(file).catch(() => undefined)
    if (!stat?.isFile()) continue
    if (stat.size > MAX_SOURCE_FILE_SIZE) continue
    if (totalSize + stat.size > MAX_SOURCE_TOTAL_SIZE) {
      result.warnings.push('源码扫描达到大小上限，结果可能不完整。')
      break
    }
    totalSize += stat.size
    const content = await fsp.readFile(file, 'utf8').catch(() => '')
    collectMatches(result.databaseTables, content, [
      /ctx\.model\.extend\(\s*(['"`])([^'"`]+)\1/g,
      /ctx\.database\.(?:remove|drop|get|set|upsert)\(\s*(['"`])([^'"`]+)\1/g,
      /dropTableIfExists\([^,]+,\s*(['"`])([^'"`]+)\1/g,
    ])
    collectMatches(result.cacheKeys, content, [
      /\.cache\.(?:clear|delete|get|set)\(\s*(['"`])([^'"`]+)\1/g,
    ])
    collectMatches(result.cleanupCommands, content, [
      /(?:ctx\.command|chain\.middleware)\(\s*(['"`])([^'"`]+)\1/g,
      /context\.command\s*(?:={2,3}|!==?)\s*(['"`])([^'"`]+)\1/g,
      /command\s*(?:={2,3}|!==?)\s*(['"`])([^'"`]+)\1/g,
    ], value => isCleanupCommand(value))
    collectPathHints(result.sourcePaths, content)
  }
  result.databaseTables = uniqueSorted(result.databaseTables).slice(0, MAX_RESULT_ITEMS)
  result.cacheKeys = uniqueSorted(result.cacheKeys).slice(0, MAX_RESULT_ITEMS)
  result.cleanupCommands = uniqueSorted(result.cleanupCommands).slice(0, MAX_RESULT_ITEMS)
  result.sourcePaths = uniqueSorted(result.sourcePaths).slice(0, MAX_RESULT_ITEMS)
  return result
}

async function collectSourceFiles(root: string) {
  const result: string[] = []
  const stack = [root]
  while (stack.length && result.length < MAX_SOURCE_FILES) {
    const dir = stack.pop()!
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const path = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(path)
      } else if (SOURCE_EXTENSIONS.has(getExtension(entry.name))) {
        result.push(path)
        if (result.length >= MAX_SOURCE_FILES) break
      }
    }
  }
  return result
}

function getExtension(name: string) {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index).toLowerCase() : ''
}

function collectMatches(target: string[], content: string, patterns: RegExp[], filter?: (value: string) => boolean) {
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const value = match[2]?.trim()
      if (!value || filter && !filter(value)) continue
      target.push(value)
    }
  }
}

function collectPathHints(target: string[], content: string) {
  const patterns = [
    /(?:fs|fsp|promises)\.(?:rm|unlink|mkdir|writeFile|appendFile|readFile|readdir)\(\s*(['"`])([^'"`]+)\1/g,
    /(?:resolve|join)\([^)]*(['"`])((?:data|cache)[/\\][^'"`]+)\1/g,
    /(['"`])((?:data|cache)[/\\][^'"`]+)\1/g,
  ]
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const raw = (match[2] || '').trim()
      const normalized = normalizeRelativeHint(raw)
      if (normalized) target.push(normalized)
    }
  }
}

function normalizeRelativeHint(value: string) {
  const normalized = value
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/+/g, '/')
  if (!/^(data|cache)\//.test(normalized)) return ''
  if (normalized.includes('${') || normalized.includes('..')) return ''
  return normalized.split('/').slice(0, 4).join('/')
}

function isCleanupCommand(value: string) {
  return /(?:wipe|purge|clean|clear|reset|migrate|legacy|delete|remove)/i.test(value)
}

async function getExistingResidueDirectories(ctx: Context, hints: string[], sourceHints: string[]) {
  const sourceSet = new Set(sourceHints)
  const directories: ResidueDirectory[] = []
  for (const hint of hints) {
    const target = resolve(ctx.baseDir, hint)
    if (!isSafeResiduePath(ctx, target)) continue
    const stats = await getPathStats(target)
    if (!stats) continue
    directories.push({
      path: target,
      relative: relative(ctx.baseDir, target).replace(/\\/g, '/'),
      source: sourceSet.has(hint) ? 'source' : 'name',
      removable: true,
      ...stats,
    })
  }
  return uniqueDirectories(directories)
    .sort((a, b) => b.size - a.size)
    .slice(0, MAX_RESULT_ITEMS)
}

async function getPathStats(path: string): Promise<Pick<ResidueDirectory, 'size' | 'files' | 'modifiedAt' | 'truncated'> | undefined> {
  const stat = await fsp.stat(path).catch(() => undefined)
  if (!stat) return
  if (!stat.isDirectory()) {
    return { size: stat.size, files: 1, modifiedAt: stat.mtimeMs }
  }
  let size = 0
  let files = 0
  let modifiedAt = stat.mtimeMs
  let truncated = false
  const stack = [path]
  while (stack.length) {
    const dir = stack.pop()!
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const child = resolve(dir, entry.name)
      const childStat = await fsp.stat(child).catch(() => undefined)
      if (!childStat) continue
      modifiedAt = Math.max(modifiedAt, childStat.mtimeMs)
      if (entry.isDirectory()) {
        stack.push(child)
      } else {
        files++
        size += childStat.size
      }
      if (files >= MAX_DIRECTORY_ENTRIES) {
        truncated = true
        stack.length = 0
        break
      }
    }
  }
  return { size, files, modifiedAt, truncated }
}

function isSafeResiduePath(ctx: Context, path: string) {
  const base = resolve(ctx.baseDir)
  const allowedRoots = [resolve(base, 'data'), resolve(base, 'cache')]
  if (!isAbsolute(path)) return false
  const root = allowedRoots.find(root => isInside(path, root))
  if (!root) return false
  if (path === root) return false
  const nested = relative(root, path).split(sep).filter(Boolean)
  if (!nested.length) return false
  if (nested.some(part => part === '..')) return false
  return true
}

function isInside(path: string, root: string) {
  const rel = relative(root, path)
  return rel === '' || !!rel && !rel.startsWith('..') && !isAbsolute(rel)
}

function uniqueDirectories(items: ResidueDirectory[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.path.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

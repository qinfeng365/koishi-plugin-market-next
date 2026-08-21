import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const DEFAULT_BASELINE = 'https://registry.koishi.chat/index.json'
const DEFAULT_TIMEOUT = 40_000
const DEFAULT_EXAMPLES = 8

const sourceLabels = {
  'https://registry.koishi.t4wefan.pub/index.json': 't4wefan',
  'https://gitee.com/shangxueink/koishi-registry-aggregator/raw/gh-pages/market.json': 'Gitee aggregator',
  'https://koi.nyan.zone/registry/index.json': 'Lipraty',
  'https://kp.itzdrli.cc': 'itzdrli primary',
  'https://koishi.itzdrli.cc': 'itzdrli backup',
  'https://registry.koishi.chat/index.json': 'Koishi official',
  'https://koishijs.github.io/registry/index.json': 'GitHub Pages',
  'https://raw.githubusercontent.com/koishijs/registry/release/index.json': 'GitHub Raw',
  'https://cdn.jsdelivr.net/gh/koishijs/registry@release/index.json': 'jsDelivr',
  'https://ghproxy.net/https://raw.githubusercontent.com/koishijs/registry/release/index.json': 'ghproxy',
  'https://ghfast.top/https://raw.githubusercontent.com/koishijs/registry/release/index.json': 'ghfast',
}

function parseOptions(args) {
  const options = {
    baseline: DEFAULT_BASELINE,
    timeout: DEFAULT_TIMEOUT,
    examples: DEFAULT_EXAMPLES,
    json: false,
    output: undefined,
  }

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    const separator = argument.indexOf('=')
    const key = separator < 0 ? argument : argument.slice(0, separator)
    const inlineValue = separator < 0 ? undefined : argument.slice(separator + 1)
    const nextValue = () => {
      const value = inlineValue ?? args[++index]
      if (value === undefined) throw new Error(`${key} requires a value`)
      return value
    }

    if (argument === '--json') {
      options.json = true
    } else if (argument === '--help' || argument === '-h') {
      options.help = true
    } else if (key === '--baseline') {
      options.baseline = nextValue()
    } else if (key === '--timeout') {
      options.timeout = Number(nextValue())
    } else if (key === '--examples') {
      options.examples = Number(nextValue())
    } else if (key === '--output') {
      options.output = nextValue()
    } else {
      throw new Error(`Unknown option: ${argument}`)
    }
  }

  if (!Number.isFinite(options.timeout) || options.timeout < 1_000) {
    throw new Error('--timeout must be a number of at least 1000 milliseconds')
  }
  if (!Number.isInteger(options.examples) || options.examples < 0) {
    throw new Error('--examples must be a non-negative integer')
  }
  return options
}

function printHelp() {
  console.log(`Usage: npm run compare:market-sources -- [options]

Fetch every built-in market source independently and compare it with a baseline.
One failed or invalid source never cancels requests to the remaining sources.

Options:
  --baseline <url|label>  Comparison baseline (default: Koishi official)
  --timeout <ms>         Per-source timeout (default: ${DEFAULT_TIMEOUT})
  --examples <count>     Difference examples per source (default: ${DEFAULT_EXAMPLES})
  --json                 Print machine-readable JSON only
  --output <path>        Also write the complete result as JSON
  -h, --help             Show this help
`)
}

async function loadBuiltInEndpoints() {
  const path = fileURLToPath(new URL('../src/node/market-internals.ts', import.meta.url))
  const sourceText = await readFile(path, 'utf8')
  const sourceFile = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true)

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'FALLBACK_ENDPOINTS') continue
      if (!declaration.initializer || !ts.isArrayLiteralExpression(declaration.initializer)) continue
      return declaration.initializer.elements.map((element) => {
        if (!ts.isStringLiteralLike(element)) {
          throw new Error('FALLBACK_ENDPOINTS contains a non-literal endpoint')
        }
        return element.text
      })
    }
  }

  throw new Error('Unable to find FALLBACK_ENDPOINTS in src/node/market-internals.ts')
}

function getSourceLabel(endpoint) {
  if (sourceLabels[endpoint]) return sourceLabels[endpoint]
  try {
    return new URL(endpoint).host
  } catch {
    return endpoint
  }
}

function createPackageMap(objects) {
  const result = new Map()
  for (const object of objects) {
    const name = object?.package?.name
    if (typeof name === 'string' && !result.has(name)) result.set(name, object)
  }
  return result
}

async function fetchSource(endpoint, timeout) {
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeout)
  const startedAt = performance.now()

  try {
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json' },
      redirect: 'follow',
      signal: controller.signal,
    })
    const text = await response.text()
    const elapsedMs = Math.round(performance.now() - startedAt)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }

    let result
    try {
      result = JSON.parse(text)
    } catch (error) {
      throw new Error(`invalid JSON: ${error.message}`)
    }
    if (!result || !Array.isArray(result.objects)) {
      throw new Error('invalid registry payload: objects is not an array')
    }

    const packageMap = createPackageMap(result.objects)
    const contentLength = Number(response.headers.get('content-length'))
    return {
      ok: true,
      endpoint,
      source: getSourceLabel(endpoint),
      status: response.status,
      elapsedMs,
      finalUrl: response.url,
      indexTime: result.time,
      forceTime: result.forceTime,
      declaredTotal: result.total,
      objects: result.objects.length,
      unique: packageMap.size,
      rawHash: createHash('sha256').update(text).digest('hex'),
      decodedBytes: Buffer.byteLength(text),
      wireBytes: Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : undefined,
      encoding: response.headers.get('content-encoding') ?? undefined,
      cacheAge: response.headers.get('age') ?? undefined,
      result,
      packageMap,
    }
  } catch (error) {
    return {
      ok: false,
      endpoint,
      source: getSourceLabel(endpoint),
      elapsedMs: Math.round(performance.now() - startedAt),
      error: error?.name === 'AbortError'
        ? `timed out after ${timeout} ms`
        : error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timeoutHandle)
  }
}

function compareSource(source, baseline, exampleCount) {
  if (!source.ok) return source

  const baselineNames = new Set(baseline.packageMap.keys())
  const sourceNames = new Set(source.packageMap.keys())
  const missingNames = [...baselineNames].filter((name) => !sourceNames.has(name)).sort()
  const extraNames = [...sourceNames].filter((name) => !baselineNames.has(name)).sort()
  const versionExamples = []
  const differences = {
    version: 0,
    downloads: 0,
    rating: 0,
    score: 0,
    verified: 0,
    insecure: 0,
    category: 0,
    package: 0,
    manifest: 0,
  }

  for (const name of baselineNames) {
    const expected = baseline.packageMap.get(name)
    const actual = source.packageMap.get(name)
    if (!actual) continue

    const expectedVersion = expected.package?.version
    const actualVersion = actual.package?.version
    if (expectedVersion !== actualVersion) {
      differences.version++
      if (versionExamples.length < exampleCount) {
        versionExamples.push(`${name}: ${expectedVersion ?? '-'} / ${actualVersion ?? '-'}`)
      }
    }
    if (expected.downloads?.lastMonth !== actual.downloads?.lastMonth) differences.downloads++
    if (!isDeepStrictEqual(expected.rating, actual.rating)) differences.rating++
    if (!isDeepStrictEqual(expected.score, actual.score)) differences.score++
    if (expected.verified !== actual.verified) differences.verified++
    if (expected.insecure !== actual.insecure) differences.insecure++
    if (expected.category !== actual.category) differences.category++
    if (!isDeepStrictEqual(expected.package, actual.package)) differences.package++
    if (!isDeepStrictEqual(expected.manifest, actual.manifest)) differences.manifest++
  }

  const sameRaw = source.rawHash === baseline.rawHash
  return {
    ...source,
    sameRaw,
    missing: missingNames.length,
    extra: extraNames.length,
    ...Object.fromEntries(Object.entries(differences).map(([key, value]) => [`${key}Diff`, value])),
    missingExamples: missingNames.slice(0, exampleCount),
    extraExamples: extraNames.slice(0, exampleCount),
    versionExamples,
  }
}

function formatBytes(value) {
  if (value === undefined) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 ** 2).toFixed(2)} MB`
}

function formatLag(indexTime, baselineTime) {
  const value = Date.parse(indexTime)
  const baseline = Date.parse(baselineTime)
  if (!Number.isFinite(value) || !Number.isFinite(baseline)) return '-'
  const delta = baseline - value
  if (Math.abs(delta) < 1_000) return 'current'
  const prefix = delta < 0 ? '+' : '-'
  const absolute = Math.abs(delta)
  if (absolute < 60_000) return `${prefix}${Math.round(absolute / 1_000)}s`
  if (absolute < 3_600_000) return `${prefix}${Math.round(absolute / 60_000)}m`
  return `${prefix}${(absolute / 3_600_000).toFixed(1)}h`
}

function stripInternalFields(row) {
  const { result, packageMap, ...serializable } = row
  return serializable
}

function printHumanReport(report) {
  console.log(`Compared ${report.rows.length} built-in sources at ${report.checkedAt}`)
  console.log(`Baseline: ${report.baseline.source} (${report.baseline.endpoint})`)
  if (report.baselineFallback) console.warn(`Requested baseline was unavailable; used ${report.baseline.source} instead.`)
  console.log('')

  console.table(report.rows.map((row) => row.ok ? {
    source: row.source,
    status: row.status,
    latency: `${row.elapsedMs} ms`,
    indexLag: formatLag(row.indexTime, report.baseline.indexTime),
    objects: `${row.objects}/${row.declaredTotal ?? '-'}`,
    exact: row.sameRaw ? 'yes' : 'no',
    missing: row.missing,
    extra: row.extra,
    versions: row.versionDiff,
    packageMeta: row.packageDiff,
    manifest: row.manifestDiff,
    decoded: formatBytes(row.decodedBytes),
  } : {
    source: row.source,
    status: 'failed',
    latency: `${row.elapsedMs} ms`,
    indexLag: '-',
    objects: '-',
    exact: '-',
    missing: '-',
    extra: '-',
    versions: '-',
    packageMeta: '-',
    manifest: '-',
    decoded: '-',
  }))

  for (const row of report.rows) {
    if (!row.ok) {
      console.log(`\n${row.source}: ${row.error}`)
      continue
    }
    if (row.sameRaw) continue

    console.log(`\n${row.source}:`)
    console.log(`  ${row.endpoint}`)
    if (row.missingExamples.length) console.log(`  missing: ${row.missingExamples.join(', ')}`)
    if (row.extraExamples.length) console.log(`  extra: ${row.extraExamples.join(', ')}`)
    if (row.versionExamples.length) console.log(`  versions (baseline / source): ${row.versionExamples.join(', ')}`)
    console.log(`  metadata differences: downloads=${row.downloadsDiff}, rating=${row.ratingDiff}, score=${row.scoreDiff}, verified=${row.verifiedDiff}, insecure=${row.insecureDiff}, category=${row.categoryDiff}`)
  }
}

const options = parseOptions(process.argv.slice(2))
if (options.help) {
  printHelp()
  process.exit(0)
}

const endpoints = await loadBuiltInEndpoints()
const requestedBaseline = endpoints.find((endpoint) => (
  endpoint === options.baseline || getSourceLabel(endpoint).toLowerCase() === options.baseline.toLowerCase()
)) ?? options.baseline
const requestedEndpoints = endpoints.includes(requestedBaseline)
  ? endpoints
  : [...endpoints, requestedBaseline]

const fetched = await Promise.all(requestedEndpoints.map((endpoint) => fetchSource(endpoint, options.timeout)))
const requestedBaselineResult = fetched.find((result) => result.endpoint === requestedBaseline)
const baseline = requestedBaselineResult?.ok
  ? requestedBaselineResult
  : fetched.find((result) => result.ok)

if (!baseline) {
  const errors = fetched.map((result) => `${result.source}: ${result.error}`).join('\n')
  throw new Error(`No market source returned a valid registry payload:\n${errors}`)
}

const rows = fetched
  .filter((result) => endpoints.includes(result.endpoint))
  .map((result) => compareSource(result, baseline, options.examples))
const report = {
  checkedAt: new Date().toISOString(),
  baseline: stripInternalFields(baseline),
  baselineFallback: baseline.endpoint !== requestedBaseline,
  rows: rows.map(stripInternalFields),
}
const serialized = `${JSON.stringify(report, null, 2)}\n`

if (options.output) await writeFile(options.output, serialized, 'utf8')
if (options.json) {
  process.stdout.write(serialized)
} else {
  printHumanReport({ ...report, rows })
  if (options.output) console.log(`\nJSON report written to ${options.output}`)
}

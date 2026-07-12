import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'

const root = resolve(import.meta.dirname, '..')
const frontendRoot = resolve(root, 'client', 'locales')
const marketRoot = resolve(root, 'client', 'market', 'locales')
const backendRoot = resolve(root, 'src', 'node', 'locales')
const failures = []

function loadYaml(filename) {
  try {
    return yaml.load(readFileSync(filename, 'utf8')) || {}
  } catch (error) {
    failures.push(filename + ': ' + error.message)
    return {}
  }
}

function flatten(value, prefix = '', output = []) {
  for (const [key, item] of Object.entries(value || {})) {
    const path = prefix ? prefix + '.' + key : key
    if (item && typeof item === 'object') {
      flatten(item, path, output)
    } else {
      output.push(path)
    }
  }
  return output
}

function comparePair(label, zhFile, enFile) {
  const zh = loadYaml(zhFile)
  const en = loadYaml(enFile)
  const zhKeys = new Set(flatten(zh))
  const enKeys = new Set(flatten(en))
  for (const key of zhKeys) {
    if (!enKeys.has(key)) failures.push(label + ': missing en-US key ' + key)
  }
  for (const key of enKeys) {
    if (!zhKeys.has(key)) failures.push(label + ': missing zh-CN key ' + key)
  }
  const enSource = readFileSync(enFile, 'utf8')
  if (/[\u3400-\u9fff]/u.test(enSource)) {
    failures.push(label + ': en-US locale contains Chinese text')
  }
  return { zh, en }
}

const domains = {}
const zhDir = resolve(frontendRoot, 'zh-CN')
const enDir = resolve(frontendRoot, 'en-US')
const zhFiles = readdirSync(zhDir).filter(name => name.endsWith('.yml')).sort()
const enFiles = readdirSync(enDir).filter(name => name.endsWith('.yml')).sort()

if (zhFiles.join('\n') !== enFiles.join('\n')) {
  failures.push('frontend locale domain files differ between zh-CN and en-US')
}

for (const filename of new Set([...zhFiles, ...enFiles])) {
  const name = filename
    .replace(/\.yml$/, '')
    .replace(/-([a-z])/g, (_, char) => char.toUpperCase())
  const pair = comparePair(
    'frontend/' + name,
    resolve(zhDir, filename),
    resolve(enDir, filename),
  )
  domains[name] = pair.zh
}

const market = comparePair(
  'frontend/market',
  resolve(marketRoot, 'zh-CN.yml'),
  resolve(marketRoot, 'en-US.yml'),
)
domains.market = market.zh

comparePair(
  'backend/messages',
  resolve(backendRoot, 'message.zh-CN.yml'),
  resolve(backendRoot, 'message.en-US.yml'),
)
comparePair(
  'backend/schema',
  resolve(backendRoot, 'schema.zh-CN.yml'),
  resolve(backendRoot, 'schema.en-US.yml'),
)

const frontendKeys = new Set(flatten(domains))
const sourceFiles = [
  ...readdirSync(resolve(root, 'client', 'components')).filter(name => /\.(?:ts|vue)$/.test(name)).map(name => resolve(root, 'client', 'components', name)),
  ...readdirSync(resolve(root, 'client', 'extensions')).filter(name => /\.(?:ts|vue)$/.test(name)).map(name => resolve(root, 'client', 'extensions', name)),
  ...readdirSync(resolve(root, 'client', 'market', 'components')).filter(name => /\.(?:ts|vue)$/.test(name)).map(name => resolve(root, 'client', 'market', 'components', name)),
  resolve(root, 'client', 'index.ts'),
  resolve(root, 'client', 'utils.ts'),
]

const keyPattern = /\b(?:t|translate)\(\s*['"]([^'"]+)['"]/g
for (const filename of sourceFiles) {
  const source = readFileSync(filename, 'utf8')
  const marketScoped = source.includes('useMarketI18n')
  for (const match of source.matchAll(keyPattern)) {
    const key = marketScoped ? 'market.' + match[1] : match[1]
    if (!frontendKeys.has(key)) failures.push(filename + ': missing locale key ' + key)
  }
}

if (failures.length) {
  console.error(failures.map(item => '- ' + item).join('\n'))
  process.exit(1)
}

console.log('i18n check passed: ' + frontendKeys.size + ' frontend keys across ' + Object.keys(domains).length + ' domains')

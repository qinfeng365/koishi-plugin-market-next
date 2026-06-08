import { Awaitable, Context, Dict, loading, message, send, socket, store, valueMap } from '@koishijs/client'
import type { Registry } from '@koishijs/registry'
import type { RegistryStatus } from 'koishi-plugin-market-next'
import { compare, satisfies } from 'semver'
import { reactive, ref, watch } from 'vue'
import { active } from '../utils'

export type ResultType = 'success' | 'warning' | 'danger' | 'primary'

interface AnalyzeResult {
  peers: Dict<PeerInfo>
  result: ResultType
}

export interface PeerInfo {
  request: string
  resolved: string
  result: ResultType
}

export function analyzeVersions(name: string, getVersion: (name: string) => string): Dict<AnalyzeResult> {
  const versions = store.registry?.[name] || manualDeps[name]?.versions
  if (!versions) return
  return valueMap(versions, (item) => {
    const peers = valueMap({ ...item.peerDependencies }, (request, name) => {
      const resolved = (getVersion ? getVersion(name) : null)
        ?? store.dependencies[name]?.resolved
        ?? store.packages?.[name]?.package.version
      const result: ResultType = !resolved
        ? item.peerDependenciesMeta?.[name]?.optional ? 'primary' : 'danger'
        : satisfies(resolved, request, { includePrerelease: true }) ? 'success' : 'danger'
      return { request, resolved, result } as PeerInfo
    })
    let result: 'success' | 'warning' | 'danger' = 'success'
    for (const peer of Object.values(peers)) {
      if (peer.result === 'danger') {
        result = 'danger'
        break
      }
      if (peer.result === 'warning') {
        result = 'warning'
      }
    }
    if (item.deprecated) result = 'danger'
    return { peers, result }
  })
}

export const manualDeps = reactive<Dict<Registry>>({})

type MarketStore = typeof store & {
  registryStatus?: Dict<RegistryStatus>
}

export function getRegistryStatus(name: string) {
  return (store as MarketStore).registryStatus?.[name]
}

export function getRegistryStatusText(name: string) {
  const status = getRegistryStatus(name)
  if (!status || status.loading) return '正在获取版本数据……'
  const endpoint = status.endpoint ? `（${formatEndpoint(status.endpoint)}）` : ''
  switch (status.reason) {
    case 'timeout':
      return `版本获取失败：npm 元数据请求超时${endpoint}`
    case 'not-found':
      return `版本获取失败：包不存在或镜像尚未同步${endpoint}`
    case 'network':
      return `版本获取失败：npm registry 网络连接失败${endpoint}`
    case 'invalid':
      return `版本获取失败：npm 元数据格式异常${endpoint}`
    case 'http':
      return `版本获取失败：npm registry 返回错误${endpoint}`
    default:
      return `版本获取失败${endpoint}${status.error ? '：' + status.error : ''}`
  }
}

function formatEndpoint(endpoint: string) {
  try {
    return new URL(endpoint).host
  } catch {
    return endpoint
  }
}

export async function addManual(name: string) {
  const data = await send('market/package', name) as Registry
  if (!data) throw new Error(`failed to fetch package metadata: ${name}`)
  data.versions = Object.fromEntries(Object.entries(data.versions).sort((a, b) => compare(b[0], a[0])))
  return manualDeps[name] = data
}

export const showManual = ref(false)
export const showConfirm = ref(false)

export async function install(override: Dict<string>, callback?: () => Awaitable<void>, forced?: boolean) {
  const instance = loading({
    text: '正在更新依赖……',
  })
  const dispose = watch(socket, () => {
    message.success('安装成功！')
    dispose()
    instance.close()
  })
  try {
    active.value = ''
    const code = await send('market/install', override, forced)
    if (code) {
      message.error('安装失败！')
    } else {
      await callback?.()
      message.success('安装成功！')
    }
  } catch (err) {
    console.error(err)
    message.error('安装超时！')
  } finally {
    dispose()
    instance.close()
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForInstalledPackage(name: string) {
  for (let index = 0; index < 40; index++) {
    if (store.packages?.[name]) return
    await sleep(250)
  }
}

async function waitForInstalledConfig(ctx: Context, name: string) {
  for (let index = 0; index < 40; index++) {
    if (ctx.configWriter?.get(name)?.length) return true
    await sleep(250)
  }
  return false
}

export async function ensureInstalledConfig(ctx: Context, name: string, silent = true) {
  if (!ctx.configWriter || !name) return
  await send('market/ensure-config', name).catch(console.error)
  await waitForInstalledPackage(name)
  if (await waitForInstalledConfig(ctx, name)) return
  if (ctx.configWriter.get(name)?.length) return
  ctx.configWriter.ensure(name, silent)
}

export async function ensureInstalledConfigs(ctx: Context, names: string[], silent = true) {
  for (const name of names) {
    await ensureInstalledConfig(ctx, name, silent)
  }
}

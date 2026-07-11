import { Awaitable, Context, Dict, loading, message, receive, send, socket, store, valueMap } from '@koishijs/client'
import type { Registry, SearchObject } from '@koishijs/registry'
import type { RegistryStatus } from 'koishi-plugin-market-next'
import { compare, satisfies } from 'semver'
import { reactive, ref, watch } from 'vue'
import { active } from '../utils'
import {
  getBundleGroupIdent,
  getPluginShortname,
  isBundlePackageName,
  parseBundleManifest,
  type PluginBundleManifest,
  type PluginBundleRecord,
} from '../../src/shared/bundle'

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
  if (!status || status.loading) {
    const endpoint = status?.endpoint ? `（${formatEndpoint(status.endpoint)}）` : ''
    const attempts = status?.attempts ? `，已尝试 ${status.attempts} 次` : ''
    return `正在从 npm registry 获取版本数据${endpoint}${attempts}……`
  }
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
  if (!data?.versions) throw new Error(`failed to fetch package metadata: ${name}`)
  data.versions = Object.fromEntries(Object.entries(data.versions).sort((a, b) => compare(b[0], a[0])))
  return manualDeps[name] = data
}

export const showManual = ref(false)
export const showConfirm = ref(false)
export const showInstallHistory = ref(false)
export const expandedDependency = ref('')
export const activeBundle = ref<SearchObject>()
export type BundleMemberCleanupTarget = {
  package: string
  plugin: string
}
export const pendingBundleUninstalls = ref<Record<string, {
  members: string[]
  cleanup: boolean
  configs?: BundleMemberCleanupTarget[]
}>>({})

export type BundleRecordView = PluginBundleRecord & {
  fallback?: boolean
}

export function createBundleRecordFromManifest(packageName: string, version = '', bundle?: PluginBundleManifest, fallback = true): BundleRecordView | undefined {
  if (!isBundlePackageName(packageName)) return
  return {
    package: packageName,
    version,
    label: bundle?.label || getPluginShortname(packageName),
    groupKey: `group:${getBundleGroupIdent(packageName)}`,
    installedAt: 0,
    fallback,
    members: (bundle?.members ?? []).map(member => ({
      ...member,
      selected: true,
      installedByBundle: false,
      skipped: true,
    })),
  }
}

export function createLocalBundleRecord(packageName: string): BundleRecordView | undefined {
  if (!isBundlePackageName(packageName)) return
  const local = store.packages?.[packageName]
  const dep = store.dependencies?.[packageName]
  if (!local && !dep) return
  const bundle = parseBundleManifest((local?.package as any)?.koishi?.bundle)
  if (!bundle?.members.length) return
  return createBundleRecordFromManifest(packageName, dep?.resolved ?? local?.package.version ?? '', bundle)
}

export function resolveBundlePackageFromGroup(groupPath?: string, records: Dict<PluginBundleRecord> = {}) {
  if (!groupPath) return
  const groupKey = groupPath.startsWith('group:') ? groupPath : `group:${groupPath}`
  const byRecord = Object.values(records).find(record => record?.groupKey === groupKey)
  if (byRecord?.package) return byRecord.package
  const names = new Set([
    ...Object.keys(store.dependencies ?? {}),
    ...Object.keys(store.packages ?? {}),
  ])
  return [...names].find((name) => {
    const record = createLocalBundleRecord(name)
    return !!record && getBundleGroupIdent(name) === groupPath.replace(/^group:/, '')
  })
}

export function resolveBundleRecordFromGroup(groupPath?: string, records: Dict<PluginBundleRecord> = {}) {
  const packageName = resolveBundlePackageFromGroup(groupPath, records)
  if (!packageName) return
  return records[packageName] || createLocalBundleRecord(packageName)
}

function normalizeGroupPath(path?: string) {
  return path?.replace(/^group:/, '')
}

export function isBundleGroupPath(path: string | undefined, groupKey: string | undefined) {
  if (!path || !groupKey) return false
  return normalizeGroupPath(path) === normalizeGroupPath(groupKey)
}

export function getBundleMemberConfigState(ctx: Context, member: BundleMemberCleanupTarget, groupKey?: string) {
  const nodes = [
    ...(ctx.configWriter?.get(member.package) ?? []),
    ...(member.plugin ? ctx.configWriter?.get(member.plugin) ?? [] : []),
  ]
  const unique = new Map<string, any>()
  for (const node of nodes) {
    if (!node) continue
    unique.set(node.path || node.id, node)
  }
  const entries = [...unique.values()]
  const getParentPath = (node: any) => node.parent?.path || node.parent?.id
  return {
    all: entries,
    group: entries.filter(node => isBundleGroupPath(getParentPath(node), groupKey)),
    external: entries.filter(node => !isBundleGroupPath(getParentPath(node), groupKey)),
  }
}

export async function fetchBundleRecord(packageName: string): Promise<BundleRecordView | undefined> {
  if (!isBundlePackageName(packageName)) return
  const registry = await (send('market/package', packageName) ?? Promise.resolve(undefined)).catch((error) => {
    console.warn(error)
    return undefined
  }) as Registry | undefined
  if (!registry?.versions) return createLocalBundleRecord(packageName)
  const targetVersion = store.dependencies?.[packageName]?.resolved ?? store.packages?.[packageName]?.package.version
  const entry = targetVersion && registry.versions?.[targetVersion]
    ? [targetVersion, registry.versions[targetVersion]] as const
    : Object.entries(registry.versions ?? {})[0]
  if (!entry) return createLocalBundleRecord(packageName)
  const [version, remote] = entry
  const bundle = parseBundleManifest((remote as any)?.koishi?.bundle)
  if (!bundle?.members.length) return createLocalBundleRecord(packageName)
  return createBundleRecordFromManifest(packageName, version, bundle)
}

export interface LogLine {
  type: 'stdout' | 'stderr'
  line: string
}

export interface InstallFallbackCandidate {
  endpoint: string
  label: string
  reason: string
}

export interface InstallOptions {
  installEndpoint?: string
}

export const MARKET_NEXT_PACKAGE = 'koishi-plugin-market-next'

export const installProgressState = reactive({
  visible: false,
  status: 'idle', // 'idle' | 'running' | 'success' | 'error'
  logs: [] as LogLine[],
  title: '正在应用依赖更改',
  selfUpdate: false,
  fallbackCandidate: undefined as InstallFallbackCandidate | undefined,
  fallbackRunning: false,
  fallbackUsed: false,
  retryFallback: undefined as undefined | (() => Promise<void>),
})

receive('market/install-log', (log: LogLine) => {
  if (installProgressState.status === 'running') {
    installProgressState.logs.push(log)
  }
})

interface InstallMessages {
  loadingText?: string
  successText?: string
  errorText?: string
  timeoutText?: string
  waitingText?: string
  selfUpdate?: boolean
  skipCallbackOnDisconnect?: boolean
  allowDisconnectSuccess?: boolean
}

export function pushInstallLog(line: string, type: LogLine['type'] = 'stdout') {
  installProgressState.logs.push({ type, line })
}

export function resetInstallFallbackState() {
  installProgressState.fallbackCandidate = undefined
  installProgressState.fallbackRunning = false
  installProgressState.fallbackUsed = false
  installProgressState.retryFallback = undefined
}

export async function prepareInstallFallbackRetry(run: (options?: InstallOptions) => Promise<number | undefined>, failedEndpoint?: string) {
  if (installProgressState.fallbackUsed || installProgressState.retryFallback) return
  const candidate = await (send('market/install-fallback-candidate', failedEndpoint) ?? Promise.resolve(undefined)).catch((error) => {
    console.warn(error)
    return undefined
  }) as InstallFallbackCandidate | undefined
  if (!candidate?.endpoint) return
  installProgressState.fallbackCandidate = candidate
  pushInstallLog(`可使用备用 npm 源 ${candidate.label || formatEndpoint(candidate.endpoint)} 重试一次；不会修改你的配置。`)
  installProgressState.retryFallback = async () => {
    if (installProgressState.fallbackRunning || installProgressState.fallbackUsed) return
    installProgressState.fallbackRunning = true
    installProgressState.fallbackUsed = true
    installProgressState.fallbackCandidate = undefined
    installProgressState.status = 'running'
    pushInstallLog(`用户确认使用备用 npm 源重试：${candidate.endpoint}`)
    try {
      const code = await run({ installEndpoint: candidate.endpoint })
      if (code) {
        installProgressState.status = 'error'
        pushInstallLog(`备用 npm 源重试失败，包管理器退出码：${code}`, 'stderr')
      }
    } finally {
      installProgressState.fallbackRunning = false
      installProgressState.retryFallback = undefined
    }
  }
}

function formatInstallError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const value = error as any
    if (typeof value.message === 'string') return value.message
    if (typeof value.error === 'string') return value.error
  }
  return String(error || 'unknown error')
}

function reportInstallRequestError(error: unknown, messages: InstallMessages) {
  const detail = formatInstallError(error)
  const isTimeout = detail === 'timeout'
  pushInstallLog(`安装请求失败：${detail}`, 'stderr')
  message.error(isTimeout
    ? messages.timeoutText ?? '安装超时！'
    : `${messages.errorText ?? '安装失败！'}${detail ? ` ${detail}` : ''}`)
}

function isSelfUpdate(override: Dict<string>) {
  return Object.prototype.hasOwnProperty.call(override, MARKET_NEXT_PACKAGE)
}

export async function install(override: Dict<string>, callback?: () => Awaitable<void>, forced?: boolean, messages: InstallMessages = {}) {
  const selfUpdate = messages.selfUpdate ?? isSelfUpdate(override)
  resetInstallFallbackState()
  installProgressState.title = messages.loadingText ?? (selfUpdate ? '正在更新 market-next……' : '正在更新依赖……')
  installProgressState.logs = []
  installProgressState.status = 'running'
  installProgressState.selfUpdate = selfUpdate
  installProgressState.visible = true
  pushInstallLog('已提交依赖变更，正在等待后端启动包管理器……')
  if (selfUpdate) {
    pushInstallLog('正在更新当前插件。安装完成后 Console 可能会短暂断开并自动重载。')
  }

  const runInstall = async (options?: InstallOptions) => {
    let resolveDisconnected: (value: number) => void
    const disconnected = new Promise<number>((resolve) => {
      resolveDisconnected = resolve
    })
    let disconnectedBeforeResponse = false
    const dispose = watch(socket, (value, previous) => {
      if (value || !previous) return
      disconnectedBeforeResponse = true
      resolveDisconnected(0)
      dispose()
    })
    const waitTimer = setTimeout(() => {
      if (installProgressState.status !== 'running') return
      pushInstallLog(messages.waitingText ?? (selfUpdate
        ? '仍在等待包管理器输出；如果 Console 随后断开连接，这是 market-next 自更新重载的正常过程。'
        : '仍在等待包管理器输出；大型依赖变更或弱网环境下可能需要更久。'))
    }, 8000)
    try {
      const task = send('market/install', override, forced, options ?? {}) ?? Promise.resolve(1)
      const code = await Promise.race([task, disconnected])
      if (disconnectedBeforeResponse && !selfUpdate && !messages.allowDisconnectSuccess) {
        installProgressState.status = 'error'
        pushInstallLog('Console 连接已断开，安装结果无法确认。请刷新依赖页确认实际状态。', 'stderr')
        message.warning('连接已断开，安装结果无法确认，请刷新后检查。')
        return undefined
      }
      if (code) {
        installProgressState.status = 'error'
        message.error(messages.errorText ?? '安装失败！')
        if (!disconnectedBeforeResponse) await prepareInstallFallbackRetry(runInstall, options?.installEndpoint)
        return code
      }
      installProgressState.status = 'success'
      const shouldSkipCallback = selfUpdate
        && disconnectedBeforeResponse
        && messages.skipCallbackOnDisconnect !== false
      if (!shouldSkipCallback) {
        try {
          await callback?.()
        } catch (error) {
          if (!disconnectedBeforeResponse) throw error
          console.warn(error)
        }
      }
      if (disconnectedBeforeResponse && !socket.value) {
        message.success(messages.successText ?? (selfUpdate
          ? 'market-next 更新已提交，Console 正在重载。'
          : '依赖变更已提交，控制台正在重载。'))
      } else {
        message.success(messages.successText ?? (selfUpdate ? 'market-next 更新完成，Console 即将重载。' : '安装成功！'))
      }
      return 0
    } finally {
      clearTimeout(waitTimer)
      dispose()
    }
  }

  try {
    active.value = ''
    await runInstall()
  } catch (err) {
    console.error(err)
    installProgressState.status = 'error'
    reportInstallRequestError(err, messages)
  }
}

export async function rollbackInstallOperation(id: string, selfUpdate = false) {
  resetInstallFallbackState()
  showInstallHistory.value = false
  installProgressState.title = selfUpdate ? '正在回退 market-next……' : '正在回退依赖版本……'
  installProgressState.logs = []
  installProgressState.status = 'running'
  installProgressState.selfUpdate = selfUpdate
  installProgressState.visible = true
  pushInstallLog('正在校验当前依赖状态并准备回退……')

  const runRollback = async (options?: InstallOptions) => {
    let resolveDisconnected: (value: number) => void
    const disconnected = new Promise<number>((resolve) => {
      resolveDisconnected = resolve
    })
    let disconnectedBeforeResponse = false
    const dispose = watch(socket, (value, previous) => {
      if (value || !previous) return
      disconnectedBeforeResponse = true
      resolveDisconnected(0)
      dispose()
    })
    const waitTimer = setTimeout(() => {
      if (installProgressState.status === 'running') {
        pushInstallLog('仍在等待包管理器输出；回退较大的依赖可能需要更久。')
      }
    }, 8000)
    try {
      const task = send('market/install-history-rollback', id, options ?? {}) ?? Promise.resolve(1)
      const code = await Promise.race([task, disconnected])
      if (disconnectedBeforeResponse && !selfUpdate) {
        installProgressState.status = 'error'
        pushInstallLog('Console 连接已断开，回退结果无法确认。请刷新依赖页和最近操作后确认。', 'stderr')
        message.warning('连接已断开，回退结果无法确认。')
        return
      }
      if (code) {
        installProgressState.status = 'error'
        message.error('依赖回退失败。')
        if (!disconnectedBeforeResponse) await prepareInstallFallbackRetry(runRollback, options?.installEndpoint)
        return code
      }
      installProgressState.status = 'success'
      message.success(disconnectedBeforeResponse
        ? '回退已提交，Console 正在重载。'
        : '依赖版本回退成功。')
      return 0
    } finally {
      clearTimeout(waitTimer)
      dispose()
    }
  }

  try {
    await runRollback()
  } catch (error) {
    console.error(error)
    installProgressState.status = 'error'
    reportInstallRequestError(error, {
      errorText: '依赖回退失败！',
      timeoutText: '依赖回退请求超时！',
    })
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
  await (send('market/ensure-config', name) ?? Promise.resolve(false)).catch(console.error)
  await waitForInstalledPackage(name)
  if (await waitForInstalledConfig(ctx, name)) return
  if (ctx.configWriter.get(name)?.length) return
  ctx.configWriter.ensure(name, silent)
}

export async function ensureInstalledConfigs(ctx: Context, names: string[], silent = true) {
  await Promise.all(names.map(name => ensureInstalledConfig(ctx, name, silent)))
}

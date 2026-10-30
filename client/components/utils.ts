import { Awaitable, Context, Dict, loading, message, receive, send, socket, store, valueMap } from '@koishijs/client'
import type { Registry, SearchObject } from '@koishijs/registry'
import { compare, satisfies } from 'semver'
import { computed, reactive, Ref, ref, shallowReactive, watch } from 'vue'
import { active, getBundleRecords, getPendingOverrides, patchMarketNextData } from '../utils'
import { translate } from '../i18n'
import { getMarketObject } from '../market/state'
import type { MarketStore } from '../registry-state'
import {
  getBundleGroupIdent,
  getPluginShortname,
  isBundlePackageName,
  parseBundleManifest,
  type PluginBundleManifest,
  type PluginBundleRecord,
} from '../../src/shared/bundle'

export type ResultType = 'success' | 'warning' | 'danger' | 'primary'

export interface ClientConfigWriter {
  get(name: string): any[] | undefined
  ensure(name: string, silent?: boolean): void
  remove(name: string): void
}

export function formatShortname(name: string) {
  const shortname = getMarketObject(name)?.shortname
  if (shortname && shortname !== name) return shortname
  if (name.startsWith('@koishijs/plugin-')) return name.slice('@koishijs/plugin-'.length)
  if (name.startsWith('koishi-plugin-')) return name.slice('koishi-plugin-'.length)
  const scoped = name.match(/^@([^/]+)\/koishi-plugin-(.+)$/)
  return scoped ? `@${scoped[1]}/${scoped[2]}` : name
}

export function getConfigWriter(ctx: Context) {
  return ctx.get('configWriter') as ClientConfigWriter | undefined
}

// Shortnames of the plugins in koishi.yml. configWriter misses entries whose $if is false.
export const configuredPlugins = computed(() => new Set(store.pluginConfigs))

interface AnalyzeResult {
  peers: Dict<PeerInfo>
  result: ResultType
}

export interface PeerInfo {
  request: string
  resolved: string
  result: ResultType
}

// Shared with cards that only need to know whether versions exist, so both read the same source.
export function getVersions(name: string) {
  return store.registry?.[name] || manualDeps[name]?.versions
}

export function analyzeVersions(name: string, getVersion: (name: string) => string): Dict<AnalyzeResult> {
  const versions = getVersions(name)
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

export function getRegistryStatus(name: string) {
  return (store as MarketStore).registryStatus?.[name]
}

export function getRegistryStatusText(name: string) {
  const status = getRegistryStatus(name)
  if (!status || status.loading) {
    return translate('dependencyCard.registry.loading', {
      endpoint: status?.endpoint ? ` (${formatEndpoint(status.endpoint)})` : '',
      attempts: status?.attempts ? `, ${translate('dependencyCard.registry.attempts', { count: status.attempts })}` : '',
    })
  }
  const endpoint = status.endpoint ? ` (${formatEndpoint(status.endpoint)})` : ''
  switch (status.reason) {
    case 'timeout':
      return translate('dependencyCard.registry.timeout', { endpoint })
    case 'not-found':
      return translate('dependencyCard.registry.notFound', { endpoint })
    case 'network':
      return translate('dependencyCard.registry.network', { endpoint })
    case 'invalid':
      return translate('dependencyCard.registry.invalid', { endpoint })
    case 'http':
      return translate('dependencyCard.registry.http', { endpoint })
    default:
      return translate('dependencyCard.registry.unknown', { endpoint, error: status.error ? `: ${status.error}` : '' })
  }
}

// Toasts end without a full stop, also when the text is a sentence from the server or from a
// dialog, which may end in a line break. An ellipsis is left alone.
export function toastText(text: string) {
  text = text.trimEnd()
  return text.endsWith('...') ? text : text.replace(/[。.]$/, '')
}

export function formatEndpoint(endpoint: string) {
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
export const showEnvironmentVersions = ref(false)
export const expandedDependency = ref('')

export type DependencyDialogType = 'ignore' | 'local-binding' | 'bundle-uninstall' | 'history'

// The dependency page keeps one set of dialogs for all cards. The target stays set after
// closing so the dialog keeps its content while it fades out.
export const dependencyDialog = reactive({
  type: undefined as DependencyDialogType | undefined,
  name: '',
})

export interface DependencyMenuItem {
  command: string
  label: string
  icon: string
  danger?: boolean
}

// Like the dialogs, one "more" menu serves every card and is placed next to the clicked button.
// The anchor is the element wrapping that button, because Element Plus rewrites the aria
// attributes of the element it is anchored to. The rest stays set while the menu fades out
// and is cleared once it is hidden.
export const dependencyMenu = shallowReactive({
  open: false,
  anchor: undefined as HTMLElement | undefined,
  items: (() => []) as () => DependencyMenuItem[],
  select: (() => {}) as (command: string) => void,
})

// Packages whose local binding is being prepared, so the card shows it even after the dialog closes.
export const bindingLocalPackages = reactive(new Set<string>())

// An empty version removes the package and undefined drops the pending change.
export function setPendingVersion(name: string, version: string | undefined) {
  const override = getPendingOverrides()
  if (version === undefined || version === store.dependencies?.[name]?.resolved) {
    delete override[name]
  } else {
    override[name] = version
  }
  void patchMarketNextData({ override: { ...override } })
}

// Runs one load at a time. A call during a load waits for it instead of starting another, and
// a refresh that keeps the current selection runs once that load is done.
export function createSerialLoader(run: (preserveSelection: boolean) => Promise<void>) {
  let task: Promise<void> | undefined
  const load = (preserveSelection = false): Promise<void> => {
    if (task) return preserveSelection ? task.then(() => load(true)) : task
    task = run(preserveSelection).finally(() => task = undefined)
    return task
  }
  return load
}

// Opens a dialog once its first load settles, or after a short wait, so it appears at the
// width that fits its data instead of resizing when the data arrives.
export function useDeferredDialog(source: Ref<boolean>, load: () => Promise<unknown>, timeout = 1000) {
  const visible = ref(false)
  let serial = 0
  watch(source, (value) => {
    const current = ++serial
    if (!value) {
      visible.value = false
      return
    }
    const reveal = () => {
      if (current === serial && source.value) visible.value = true
    }
    void load().finally(reveal)
    setTimeout(reveal, timeout)
  })
  return computed({
    get: () => visible.value,
    set: (value: boolean) => source.value = value,
  })
}
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

export function getInstalledVersion(name: string) {
  return store.dependencies?.[name]?.resolved ?? store.packages?.[name]?.package.version ?? ''
}

export function findBundleRecord(packageName: string) {
  return getBundleRecords()[packageName] || createLocalBundleRecord(packageName)
}

export function createLocalBundleRecord(packageName: string): BundleRecordView | undefined {
  if (!isBundlePackageName(packageName)) return
  const local = store.packages?.[packageName]
  const dep = store.dependencies?.[packageName]
  if (!local && !dep) return
  const bundle = parseBundleManifest((local?.package as any)?.koishi?.bundle)
  if (!bundle?.members.length) return
  return createBundleRecordFromManifest(packageName, getInstalledVersion(packageName), bundle)
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
  const configWriter = getConfigWriter(ctx)
  const nodes = [
    ...(configWriter?.get(member.package) ?? []),
    ...(member.plugin ? configWriter?.get(member.plugin) ?? [] : []),
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
  const targetVersion = getInstalledVersion(packageName)
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
  title: '',
  selfUpdate: false,
  environmentRestore: false,
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
  pushInstallLog(translate('operations.progress.fallbackLog', {
    endpoint: candidate.label || formatEndpoint(candidate.endpoint),
  }))
  installProgressState.retryFallback = async () => {
    if (installProgressState.fallbackRunning || installProgressState.fallbackUsed) return
    installProgressState.fallbackRunning = true
    installProgressState.fallbackUsed = true
    installProgressState.fallbackCandidate = undefined
    installProgressState.status = 'running'
    pushInstallLog(translate('operations.progress.fallbackConfirmed', { endpoint: candidate.endpoint }))
    try {
      const code = await run({ installEndpoint: candidate.endpoint })
      if (code) {
        installProgressState.status = 'error'
        pushInstallLog(translate('operations.progress.fallbackFailed', { code }), 'stderr')
      }
    } catch (error) {
      const detail = formatInstallError(error)
      installProgressState.status = 'error'
      pushInstallLog(translate('operations.progress.requestFailed', { detail }), 'stderr')
      message.error(withErrorDetail(translate('operations.progress.installError'), detail))
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
  pushInstallLog(translate('operations.progress.requestFailed', { detail }), 'stderr')
  message.error(isTimeout
    ? messages.timeoutText ?? translate('operations.progress.installTimeout')
    : withErrorDetail(messages.errorText ?? translate('operations.progress.installError'), detail))
}

// How every failed install request reads in a toast. The detail often comes from the server and
// ends in a full stop, which a toast drops; the ！ of the texts stays, as only full stops are dropped.
function withErrorDetail(text: string, detail: string) {
  return detail ? translate('operations.progress.errorWithDetail', { message: text, detail: toastText(detail) }) : text
}

function isSelfUpdate(override: Dict<string>) {
  return Object.prototype.hasOwnProperty.call(override, MARKET_NEXT_PACKAGE)
}

export async function install(override: Dict<string>, callback?: () => Awaitable<void>, forced?: boolean, messages: InstallMessages = {}) {
  const selfUpdate = messages.selfUpdate ?? isSelfUpdate(override)
  resetInstallFallbackState()
  installProgressState.title = messages.loadingText ?? (selfUpdate
    ? translate('operations.progress.selfUpdateTitle')
    : translate('operations.progress.dependencyTitle'))
  installProgressState.logs = []
  installProgressState.status = 'running'
  installProgressState.selfUpdate = selfUpdate
  installProgressState.environmentRestore = false
  installProgressState.visible = true
  pushInstallLog(translate('operations.progress.submitted'))
  if (selfUpdate) {
    pushInstallLog(translate('operations.progress.selfSubmitted'))
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
        ? translate('operations.progress.waitingSelf')
        : translate('operations.progress.waitingDependencies')))
    }, 8000)
    try {
      const task = send('market/install', override, forced, options ?? {}) ?? Promise.resolve(1)
      const code = await Promise.race([task, disconnected])
      if (disconnectedBeforeResponse && !selfUpdate && !messages.allowDisconnectSuccess) {
        installProgressState.status = 'error'
        pushInstallLog(translate('operations.progress.disconnected'), 'stderr')
        message.warning(translate('operations.progress.disconnectedShort'))
        return undefined
      }
      if (code) {
        installProgressState.status = 'error'
        message.error(messages.errorText ?? translate('operations.progress.installError'))
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
          ? translate('operations.progress.selfSubmittedSuccess')
          : translate('operations.progress.dependenciesSubmittedSuccess')))
      } else {
        message.success(messages.successText ?? (selfUpdate
          ? translate('operations.progress.selfSuccessToast')
          : translate('operations.progress.successToast')))
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

export async function applyEnvironmentSnapshot(id: string, selfUpdate = false) {
  resetInstallFallbackState()
  showEnvironmentVersions.value = false
  installProgressState.title = translate('operations.progress.environmentTitle')
  installProgressState.logs = []
  installProgressState.status = 'running'
  installProgressState.selfUpdate = false
  installProgressState.environmentRestore = true
  installProgressState.visible = true
  pushInstallLog(translate('operations.progress.environmentPreparing'))

  const runRestore = async (options?: InstallOptions) => {
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
        pushInstallLog(translate('operations.progress.environmentWaiting'))
      }
    }, 8000)
    try {
      const task = send('market/environment-snapshot-apply', id, options ?? {}) ?? Promise.resolve(1)
      const code = await Promise.race([task, disconnected])
      if (disconnectedBeforeResponse && !selfUpdate) {
        installProgressState.status = 'error'
        pushInstallLog(translate('operations.progress.environmentDisconnected'), 'stderr')
        message.warning(translate('operations.progress.environmentDisconnectedShort'))
        return
      }
      if (code) {
        installProgressState.status = 'error'
        message.error(translate('operations.progress.environmentError'))
        if (!disconnectedBeforeResponse) await prepareInstallFallbackRetry(runRestore, options?.installEndpoint)
        return code
      }
      installProgressState.status = 'success'
      message.success(disconnectedBeforeResponse
        ? translate('operations.progress.environmentSubmitted')
        : translate('operations.progress.environmentSuccess'))
      return 0
    } finally {
      clearTimeout(waitTimer)
      dispose()
    }
  }

  try {
    await runRestore()
  } catch (error) {
    console.error(error)
    installProgressState.status = 'error'
    reportInstallRequestError(error, {
      errorText: translate('operations.progress.environmentErrorTitle'),
      timeoutText: translate('operations.progress.environmentTimeout'),
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

async function waitForInstalledConfig(name: string) {
  for (let index = 0; index < 40; index++) {
    if (configuredPlugins.value.has(getPluginShortname(name))) return true
    await sleep(250)
  }
  return false
}

export async function ensureInstalledConfig(ctx: Context, name: string, silent = true) {
  if (!name || !getConfigWriter(ctx)) return
  await (send('market/ensure-config', name) ?? Promise.resolve(false)).catch(console.error)
  await waitForInstalledPackage(name)
  if (await waitForInstalledConfig(name)) return
  const configWriter = getConfigWriter(ctx)
  if (!configWriter || configWriter.get(name)?.length) return
  configWriter.ensure(name, silent)
}

export async function ensureInstalledConfigs(ctx: Context, names: string[], silent = true) {
  await Promise.all(names.map(name => ensureInstalledConfig(ctx, name, silent)))
}

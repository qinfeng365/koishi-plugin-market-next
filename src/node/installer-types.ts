import { defineProperty, Dict, pick, Time } from 'koishi'
import Scanner, { DependencyMetaKey, PackageJson, RemotePackage } from '@koishijs/registry'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { compare } from 'semver'
import type { DependencySource } from '../shared'

export const FULL_RELOAD_DELAY = Time.second
export const SELF_PACKAGE = 'koishi-plugin-market-next'

export interface InstallerConfig {
  endpoint?: string
  timeout?: number
  autoRoute?: boolean
  retry?: number
  concurrency?: number
  installLogRetentionHours?: number
  /** @deprecated use installLogRetentionHours */
  installLogRetention?: number
}

export interface InstallerGetDepsOptions {
  metadata?: boolean
  background?: boolean
}

export interface InstallOptions {
  installEndpoint?: string
}

export interface InstallFallbackCandidate {
  endpoint: string
  label: string
  reason: string
}

export interface LocalBindingResult {
  request: string
  filename: string
  size: number
}

export interface Dependency {
  /** requested semver range, normalized for display */
  request: string
  /** installed package version */
  resolved?: string
  /** whether it is a workspace package */
  workspace?: boolean
  /** dependency origin used to decide whether npm may manage it */
  source?: DependencySource
  /** whether this dependency is supplied by a local source */
  local?: boolean
  /** whether package.json contains a reproducible local source */
  bound?: boolean
  /** valid but unsupported request syntax */
  invalid?: boolean
  /** latest registry version */
  latest?: string
}

export interface YarnLog {
  type: 'warning' | 'info' | 'error' | string
  name: number | null
  displayName: string
  indent?: string
  data: string
}

export interface LocalPackage extends PackageJson {
  private?: boolean
  $workspace?: boolean
}

export interface PackageManifestSnapshot {
  manifest: PackageJson
  content: string
  dependencies: Dict<string>
}

export const levelMap = {
  info: 'info',
  warning: 'debug',
  error: 'warn',
} as const

export function loadManifest(name: string, baseDir?: string) {
  const resolver = baseDir ? createRequire(resolve(baseDir, 'package.json')) : require
  const filename = resolver.resolve(name + '/package.json')
  const meta: LocalPackage = JSON.parse(readFileSync(filename, 'utf8'))
  meta.dependencies ||= {}
  defineProperty(meta, '$workspace', !filename.includes('node_modules'))
  return meta
}

export function resolvePackageManifest(name: string, baseDir: string) {
  const resolver = createRequire(resolve(baseDir, 'package.json'))
  return resolver.resolve(name + '/package.json')
}

export function getVersions(versions: RemotePackage[]) {
  return Object.fromEntries(versions
    .map(item => [item.version, pick(item, ['peerDependencies', 'peerDependenciesMeta', 'deprecated'])] as const)
    .sort(([a], [b]) => compare(b, a))) as Dict<Pick<RemotePackage, DependencyMetaKey>>
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function formatDeps(deps: Dict<string>) {
  const entries = Object.entries(deps)
  if (!entries.length) return '(none)'
  return entries.map(([name, version]) => `${name}@${version || '(remove)'}`).join(', ')
}

export function formatLocalDeps(deps: Dict<Dependency>) {
  const entries = Object.entries(deps)
  if (!entries.length) return '(none)'
  return entries.map(([name, dep]) => `${name}{request=${dep.request || '-'},resolved=${dep.resolved ?? '-'},source=${dep.source ?? '-'},local=${!!dep.local}}`).join(', ')
}

export function pickMetadataProbe(names: string[]) {
  return names.find(name => name === 'koishi')
    || names.find(name => name === '@koishijs/plugin-console')
    || names.find(name => Scanner.isPlugin(name))
    || names[0]
}

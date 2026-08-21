import { Dict, Logger, Time } from 'koishi'
import Scanner, { PackageJson } from '@koishijs/registry'
import { basename, dirname, relative, resolve } from 'path'
import { promises as fsp } from 'fs'
import { createHash } from 'crypto'
import spawn from 'execa'
import { resolvePackageManifest, type Dependency, type LocalBindingResult } from './installer-types'

const logger = new Logger('market')

export const MAX_LOCAL_BINDING_PACK_SIZE = 64 * 1024 * 1024

export interface LocalBindingPackResult {
  name?: string
  version?: string
  filename: string
  size: number
}

export function parseNpmPackOutput(output: string): LocalBindingPackResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    throw new Error('invalid npm pack output')
  }
  const item = Array.isArray(parsed) ? parsed[0] : undefined
  if (!item || typeof item !== 'object') throw new Error('invalid npm pack output')
  const record = item as Record<string, unknown>
  const filename = validatePackFilename(record.filename)
  const size = Number(record.size)
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_LOCAL_BINDING_PACK_SIZE) {
    throw new Error('invalid npm pack size')
  }
  return {
    name: typeof record.name === 'string' ? record.name : undefined,
    version: typeof record.version === 'string' ? record.version : undefined,
    filename,
    size,
  }
}

export function createLocalBindingRequest(filename: string) {
  return `file:.yarn/local/${validatePackFilename(filename)}`
}

export function createHashedLocalBindingFilename(filename: string, hash: string) {
  const safeFilename = validatePackFilename(filename)
  if (!/^[a-f0-9]{12,64}$/i.test(hash)) throw new Error('invalid npm pack hash')
  return `${safeFilename.slice(0, -4)}-${hash.toLowerCase()}.tgz`
}

export async function prepareLocalBindingPackage(
  baseDir: string,
  name: string,
  dependency: Dependency | undefined,
  dependencies: Dict<string>,
  timeout?: number,
): Promise<LocalBindingResult> {
  if (!Scanner.isPlugin(name) || !Object.prototype.hasOwnProperty.call(dependencies, name)) {
    throw new Error('只能绑定当前 package.json 中的 Koishi 插件依赖。')
  }
  if (!dependency?.resolved || dependency.source !== 'unbound') {
    throw new Error('该插件不是来源未绑定的本地插件。')
  }
  const currentRequest = dependencies[name].replace(/^[~^]/, '')
  if (dependency.request !== currentRequest) {
    throw new Error('package.json 已发生变化，请刷新依赖后重试。')
  }

  let manifestFile: string
  try {
    manifestFile = resolvePackageManifest(name, baseDir)
  } catch {
    throw new Error('无法定位本地插件目录；请确认插件仍可被当前 Koishi 实例加载。')
  }
  const sourceDir = dirname(manifestFile)
  const manifest = JSON.parse(await fsp.readFile(manifestFile, 'utf8')) as PackageJson
  if (manifest.name !== name || manifest.version !== dependency.resolved) {
    throw new Error('本地插件清单与当前依赖状态不一致，请刷新依赖后重试。')
  }

  const destination = resolve(baseDir, '.yarn', 'local')
  await fsp.mkdir(destination, { recursive: true })
  const temporary = await fsp.mkdtemp(resolve(destination, '.market-next-pack-'))
  try {
    const child = await spawn('npm', [
      'pack', sourceDir,
      '--ignore-scripts',
      '--json',
      '--pack-destination', temporary,
    ], {
      cwd: baseDir,
      timeout: Math.max(Time.minute, timeout ?? 0),
    })
    const pack = parseNpmPackOutput(child.stdout)
    if (pack.name && pack.name !== name || pack.version && pack.version !== dependency.resolved) {
      throw new Error('本地插件打包结果与当前依赖不一致。')
    }
    const packedFile = resolve(temporary, pack.filename)
    if (dirname(packedFile) !== temporary || relative(temporary, packedFile).startsWith('..')) {
      throw new Error('本地插件打包路径无效。')
    }
    const stat = await fsp.stat(packedFile)
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_LOCAL_BINDING_PACK_SIZE || stat.size !== pack.size) {
      throw new Error('本地插件打包文件无效或过大。')
    }
    const content = await fsp.readFile(packedFile)
    const hash = createHash('sha256').update(content).digest('hex')
    const filename = createHashedLocalBindingFilename(pack.filename, hash.slice(0, 12))
    const target = resolve(destination, filename)
    if (dirname(target) !== destination || relative(destination, target).startsWith('..')) {
      throw new Error('本地插件目标路径无效。')
    }

    const validateExistingTarget = async () => {
      let targetStat
      try {
        targetStat = await fsp.stat(target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
        throw error
      }
      if (!targetStat.isFile() || targetStat.size !== stat.size) {
        throw new Error('同名本地插件归档已存在，但文件状态不一致。')
      }
      const targetHash = createHash('sha256').update(await fsp.readFile(target)).digest('hex')
      if (targetHash !== hash) {
        throw new Error('同名本地插件归档已存在，但文件内容不一致。')
      }
      return true
    }

    if (!await validateExistingTarget()) {
      try {
        // The npm output already lives on the destination volume, so rename publishes it atomically.
        await fsp.rename(packedFile, target)
      } catch (error) {
        // A concurrent binding may have published the same content first.
        if (!await validateExistingTarget()) throw error
      }
    }
    logger.info(`local plugin source prepared: ${name}@${dependency.resolved}, file=${filename}, size=${pack.size}`)
    return {
      request: createLocalBindingRequest(filename),
      filename,
      size: pack.size,
    }
  } finally {
    await fsp.rm(temporary, { recursive: true, force: true }).catch((error) => {
      logger.debug(`failed to remove local binding temp directory ${temporary}: ${error instanceof Error ? error.message : error}`)
    })
  }
}

function validatePackFilename(value: unknown) {
  if (typeof value !== 'string'
    || basename(value) !== value
    || !/^[a-z0-9@._+-]+\.tgz$/i.test(value)) {
    throw new Error('invalid npm pack filename')
  }
  return value
}

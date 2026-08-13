import { basename } from 'path'

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

function validatePackFilename(value: unknown) {
  if (typeof value !== 'string'
    || basename(value) !== value
    || !/^[a-z0-9@._+-]+\.tgz$/i.test(value)) {
    throw new Error('invalid npm pack filename')
  }
  return value
}

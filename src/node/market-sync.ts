import { Context, Time } from 'koishi'
import { gt, valid } from 'semver'
import type MarketProvider from './market'
import { logger } from './logger'

// npm mirrors can lag behind the market index, so a release that is still missing from the
// registry is checked again after this long, for about an hour at most. Some releases never show up,
// for example ones the version filter drops, and they should not be fetched forever.
const RECHECK_INTERVAL = 10 * Time.minute
const MAX_ATTEMPTS = 6

type DependencyState = { latest?: string, resolved?: string, local?: boolean, invalid?: boolean, workspace?: boolean }

export interface RecheckRecord {
  at: number
  attempts: number
}

// Picks the dependencies whose market release is newer than their known latest version and that
// are due for a check, and records the attempt. Records for releases no longer pending are dropped.
export function findMarketUpdates(
  deps: Record<string, DependencyState>,
  data: Record<string, { package?: { version?: string } } | undefined>,
  checked: Map<string, RecheckRecord>,
  now = Date.now(),
) {
  const pending = new Set<string>()
  const targets = Object.keys(deps).filter((name) => {
    const { latest, resolved, local, invalid, workspace } = deps[name]
    const version = data[name]?.package?.version
    if (!resolved || local || invalid || workspace || !valid(latest) || !valid(version) || !gt(version, latest)) return false
    const key = `${name}@${version}`
    pending.add(key)
    const record = checked.get(key)
    if (record && (record.attempts >= MAX_ATTEMPTS || now - record.at < RECHECK_INTERVAL)) return false
    checked.set(key, { at: now, attempts: (record?.attempts ?? 0) + 1 })
    return true
  })
  for (const key of checked.keys()) {
    if (!pending.has(key)) checked.delete(key)
  }
  return targets
}

// After the market refreshes, fetches the versions again for installed dependencies whose
// market release is newer than the latest version the dependencies page knows about.
export function createMarketSync(ctx: Context, provider: MarketProvider) {
  const checked = new Map<string, RecheckRecord>()
  let running = false
  let queued = false

  async function sync() {
    if (!ctx.installer) return
    if (running) {
      queued = true
      return
    }
    running = true
    try {
      do {
        queued = false
        const deps: Record<string, DependencyState> = ctx.installer.getCachedDeps()
        const data = provider.getLoadedObjects(Object.keys(deps).filter(name => valid(deps[name].latest)))
        const targets = findMarketUpdates(deps, data, checked)
        if (!targets.length) continue
        const changed = await ctx.installer.refreshPackages(targets)
        if (changed === undefined) {
          // A full dependency refresh replaced the cache, so these checks do not count.
          for (const name of targets) checked.delete(`${name}@${data[name].package.version}`)
          continue
        }
        logger.info(`dependency metadata rechecked after market refresh: targets=${targets.join(', ')}, updated=${changed}`)
      } while (queued)
    } catch (error) {
      logger.debug(`dependency metadata recheck after market refresh failed: ${error instanceof Error ? error.message : error}`)
    } finally {
      running = false
    }
  }

  const schedule = ctx.debounce(() => void sync(), Time.second)
  // A full dependency refresh fetches from the fastest route again, which may undo what earlier
  // rechecks found, so it passes resetChecks to let every pending release be checked once more.
  return (resetChecks = false) => {
    if (resetChecks) checked.clear()
    schedule()
  }
}

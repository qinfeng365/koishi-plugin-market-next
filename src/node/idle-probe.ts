import { Context, Time } from 'koishi'
import type { Config } from './config'

export function setupIdleProbe(ctx: Context, config: Config) {
  if (config.idleProbe === false) return

  const logger = ctx.logger('market')
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let lastProbe = 0
  let lastFailure = 0

  const getClientCount = () => {
    const clients = ctx.console.clients as any
    if (!clients) return 0
    if (typeof clients.size === 'number') return clients.size
    return Object.keys(clients).length
  }
  const clearIdleTimer = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const getDelay = () => Math.max(0, config.idleProbeDelay ?? Time.minute * 5)
  const getBootDelay = () => Math.max(0, config.idleProbeBootDelay ?? Time.minute)
  const getInterval = () => Math.max(0, config.idleProbeInterval ?? Time.hour * 6)

  const runProbe = async () => {
    clearIdleTimer()
    if (!ctx.scope.isActive) return
    if (getClientCount()) return
    if (ctx.installer.isInstalling) {
      logger.debug('skip idle background probe because dependency install is active')
      schedule(getDelay())
      return
    }
    const bootWait = getBootDelay() - (Date.now() - startedAt)
    if (bootWait > 0) {
      schedule(bootWait)
      return
    }
    const retryWait = lastFailure ? Math.min(Time.minute * 5, getInterval()) - (Date.now() - lastFailure) : 0
    if (!lastProbe && retryWait > 0) {
      logger.debug(`skip idle background probe because retry gate is active: remaining=${retryWait}ms`)
      schedule(retryWait)
      return
    }
    const intervalWait = lastProbe ? getInterval() - (Date.now() - lastProbe) : 0
    if (intervalWait > 0) {
      logger.debug(`skip idle background probe because interval gate is active: remaining=${intervalWait}ms`)
      schedule(intervalWait)
      return
    }
    if (running) return

    running = true
    const probeStartedAt = Date.now()
    logger.info(`idle background probe started: clients=0, delay=${getDelay()}ms, interval=${getInterval()}ms`)
    try {
      const [depsResult, marketResult] = await Promise.allSettled([
        ctx.installer.probeDependenciesInBackground('idle').then(() => true),
        ctx.console.services.market?.probeInBackground?.('idle probe') ?? Promise.resolve(false),
      ])
      const succeeded = depsResult.status === 'fulfilled' && depsResult.value === true
        || marketResult.status === 'fulfilled' && marketResult.value !== false
      if (succeeded) {
        lastProbe = Date.now()
        lastFailure = 0
        logger.info(`idle background probe completed: elapsed=${Date.now() - probeStartedAt}ms`)
      } else {
        lastFailure = Date.now()
        const reason = depsResult.status === 'rejected'
          ? depsResult.reason
          : marketResult.status === 'rejected'
            ? marketResult.reason
            : 'no probe result'
        logger.warn(`idle background probe failed: ${reason instanceof Error ? reason.message : reason}`)
      }
    } catch (error) {
      lastFailure = Date.now()
      logger.warn(`idle background probe failed: ${error instanceof Error ? error.message : error}`)
    } finally {
      running = false
      if (!getClientCount()) schedule(lastProbe ? getInterval() : Math.min(Time.minute * 5, getInterval()))
    }
  }

  const schedule = (delay = getDelay()) => {
    clearIdleTimer()
    if (!ctx.scope.isActive || config.idleProbe === false) return
    if (getClientCount()) return
    timer = setTimeout(() => void runProbe(), Math.max(0, delay))
    logger.debug(`idle background probe scheduled: delay=${Math.max(0, delay)}ms`)
  }

  ctx.on('console/connection', () => {
    if (getClientCount()) {
      clearIdleTimer()
      logger.debug(`idle background probe cancelled: clients=${getClientCount()}`)
    } else {
      schedule()
    }
  })

  ctx.on('ready', () => {
    if (!getClientCount()) schedule(Math.max(getDelay(), getBootDelay()))
  })

  ctx.effect(() => () => clearIdleTimer())
}

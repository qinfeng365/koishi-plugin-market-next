import { Context, Logger } from 'koishi'
import { logLevels, type LogLevel } from './market-internals'

let currentLogLevel: LogLevel = 'warn'

export function setLogLevel(level?: LogLevel) {
  if (level && logLevels.includes(level)) {
    currentLogLevel = level
  }
}

export function getLogLevel(): LogLevel {
  return currentLogLevel
}

export function shouldLog(level: LogLevel, configuredLevel = currentLogLevel): boolean {
  if (configuredLevel === 'silent') return false
  return logLevels.indexOf(configuredLevel) >= logLevels.indexOf(level)
}

export interface MarketLogContext {
  scope?: { isActive?: boolean }
  logger?: (name: string) => Logger
}

export class MarketLogger {
  private baseLogger: Logger

  constructor(
    private name = 'market',
    private getContext?: () => MarketLogContext | undefined,
  ) {
    this.baseLogger = new Logger(name)
  }

  private get ctxLogger(): Logger {
    const ctx = this.getContext?.()
    if (ctx?.logger) {
      return ctx.logger(this.name)
    }
    return this.baseLogger
  }

  private isScopeActive(): boolean {
    const ctx = this.getContext?.()
    if (ctx?.scope && ctx.scope.isActive === false) return false
    return true
  }

  log(level: Exclude<LogLevel, 'silent'>, message: string, ...args: any[]) {
    if (!this.isScopeActive()) return
    if (!shouldLog(level)) return

    const logger = this.ctxLogger
    if (level === 'debug') {
      // Koishi's global logger may hide debug records from the log page.
      // Mirror them as info records with [debug] prefix.
      logger.info(`[debug] ${message}`, ...args)
    } else {
      (logger as any)[level](message, ...args)
    }
  }

  debug(message: string, ...args: any[]) {
    this.log('debug', message, ...args)
  }

  info(message: string, ...args: any[]) {
    this.log('info', message, ...args)
  }

  warn(message: string, ...args: any[]) {
    this.log('warn', message, ...args)
  }

  error(message: string, ...args: any[]) {
    this.log('error', message, ...args)
  }
}

export const logger = new MarketLogger('market')

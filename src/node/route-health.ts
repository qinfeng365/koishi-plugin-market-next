const DEFAULT_RECENT_SUCCESS_WINDOW = 10 * 60 * 1000

export interface RouteHealthStats {
  score: number
  successes: number
  failures: number
  consecutiveFailures?: number
  averageElapsed?: number
  lastSuccess?: number
  contentEncoding?: string
}

export interface RouteHealthScoreOptions {
  baseScore?: number
  fastThreshold: number
  now: number
  recentSuccessWindow?: number
  compressionBonus?: boolean
}

export function scoreRouteHealth(stats: RouteHealthStats | undefined, options: RouteHealthScoreOptions) {
  let score = options.baseScore ?? 0
  if (!stats) return score

  const total = stats.successes + stats.failures
  if (total) {
    const successRate = stats.successes / total
    score += (successRate - 0.5) * 6
    if (total >= 3 && successRate >= 0.8) score += 1.5
    if (total >= 3 && successRate < 0.35) score -= 2
  }

  score += stats.score
  score += Math.min(2, stats.successes * 0.25)
  score -= Math.min(2, stats.failures * 0.2)

  if (stats.averageElapsed != null) {
    if (stats.averageElapsed <= 300) score += 1.5
    else if (stats.averageElapsed <= options.fastThreshold) score += 1
    else if (stats.averageElapsed <= 1200) score += 0.5
    else if (stats.averageElapsed <= 2500) score -= 0.3
    else if (stats.averageElapsed <= 4000) score -= 1
    else score -= 2
  }

  if (options.compressionBonus) {
    if (stats.contentEncoding === 'br') score += 0.5
    if (stats.contentEncoding === 'gzip') score += 0.2
  }

  const recentSuccessWindow = options.recentSuccessWindow ?? DEFAULT_RECENT_SUCCESS_WINDOW
  if (stats.lastSuccess && options.now - stats.lastSuccess <= recentSuccessWindow) score += 1.5
  score -= Math.min(5, (stats.consecutiveFailures ?? 0) * 1.5)
  return score
}

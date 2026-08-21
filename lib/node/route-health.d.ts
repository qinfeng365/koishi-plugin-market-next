export interface RouteHealthStats {
    score: number;
    successes: number;
    failures: number;
    consecutiveFailures?: number;
    averageElapsed?: number;
    lastSuccess?: number;
    contentEncoding?: string;
}
export interface RouteHealthScoreOptions {
    baseScore?: number;
    fastThreshold: number;
    now: number;
    recentSuccessWindow?: number;
    compressionBonus?: boolean;
}
export declare function scoreRouteHealth(stats: RouteHealthStats | undefined, options: RouteHealthScoreOptions): number;

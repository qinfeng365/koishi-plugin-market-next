import { Context, Dict } from 'koishi';
import { type EndpointResult, type LogLevel, type MarketProviderConfig, type PersistedRouteStats } from './market-internals';
import { MarketDiskCache } from './market-cache';
interface MarketRouterOptions {
    isStale: (serial: number) => boolean;
    selectEndpoint: (endpoint: string) => void;
    onStatsChanged: () => void;
    log: (level: Exclude<LogLevel, 'silent'>, message: string) => void;
}
export declare class MarketRouter {
    private ctx;
    private config;
    private cache;
    private options;
    private stats;
    private pendingControllers;
    constructor(ctx: Context, config: MarketProviderConfig, cache: MarketDiskCache, options: MarketRouterOptions);
    fetchIndex(serial: number): Promise<EndpointResult>;
    getEndpointCandidates(): string[];
    getPreferredEndpoint(): string;
    getScore(endpoint: string): number;
    getScores(endpoints?: string[]): {
        endpoint: string;
        score: number;
        successes: number;
        failures: number;
        consecutiveFailures: number;
        cooldownUntil: number;
        coolingDown: boolean;
        averageElapsed: number;
        lastSuccess: number;
        contentEncoding: string;
        cached: boolean;
        cachedAt: number;
    }[];
    clearCooldowns(reason: string): void;
    restoreStats(persisted: Dict<PersistedRouteStats>): void;
    serializeStats(): Dict<PersistedRouteStats>;
    abortPendingRequests(reason: string): void;
    private fetchIndexFromEndpoints;
    private getRescueEndpoints;
    private getEndpoints;
    private waitRouteTurn;
    private recordSuccess;
    private recordFailure;
    private isCoolingDown;
    private fetchEndpoint;
    private trackController;
    private untrackControllers;
    private isInternalAbort;
}
export {};

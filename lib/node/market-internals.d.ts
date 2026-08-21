import { Dict } from 'koishi';
import type { SearchResult } from '@koishijs/registry';
import type { MarketPerformance, MarketPerformanceSnapshot } from '../shared';
export declare const FALLBACK_ENDPOINTS: string[];
export declare const ROUTE_STAGGER = 80;
export declare const FIRST_PAYLOAD_TIMEOUT: number;
export declare const FAST_ROUTE_THRESHOLD: number;
export declare const MAX_CACHE_ENTRIES = 3;
export declare const CACHE_ENTRY_TTL: number;
export declare const logLevels: readonly ["silent", "error", "warn", "info", "debug"];
export type LogLevel = typeof logLevels[number];
export type MarketSource = NonNullable<MarketPerformance['source']>;
export interface MarketProviderConfig {
    endpoint?: string;
    timeout?: number;
    proxyAgent?: string;
    autoRoute?: boolean;
    logLevel?: LogLevel;
}
export interface CacheFile {
    endpoint: string;
    fetchedAt: number;
    validatedAt?: number;
    etag?: string;
    lastModified?: string;
    hash?: string;
    size?: number;
    wireSize?: number;
    contentEncoding?: string;
    result: SearchResult;
}
export interface CacheEntry extends Omit<CacheFile, 'result'> {
    result?: SearchResult;
    file?: string;
    objects?: number;
}
export interface PersistedRouteStats {
    averageElapsed?: number;
    lastSuccess?: number;
    contentEncoding?: string;
    score: number;
    consecutiveFailures?: number;
    cooldownUntil?: number;
}
export interface CacheStore {
    version: 3;
    entries: Dict<CacheEntry>;
    lastUsed?: string;
    routeStats?: Dict<PersistedRouteStats>;
}
export type CacheMeta = Omit<CacheFile, 'result'>;
export interface EndpointResult {
    endpoint: string;
    preferredEndpoint?: string;
    fallbackReason?: 'primary-failed' | 'primary-slow' | 'rescue';
    result: SearchResult;
    elapsed: number;
    candidates: number;
    source: MarketSource;
    timings: Dict<number>;
    size?: number;
    wireSize?: number;
    contentEncoding?: string;
    hash?: string;
    etag?: string;
    lastModified?: string;
    cachedAt?: number;
    validatedAt?: number;
}
export interface RouteStats {
    score: number;
    successes: number;
    failures: number;
    consecutiveFailures?: number;
    cooldownUntil?: number;
    averageElapsed?: number;
    lastSuccess?: number;
    contentEncoding?: string;
}
export declare function formatError(error: unknown): string;
export declare function formatStack(error: unknown): string;
export declare function shortHash(hash?: string): string;
export declare function formatTime(value?: number): string;
export declare function formatAge(age?: number): string;
export declare function formatBytes(value?: number): string;
export declare function parseContentLength(value?: string | null): number;
export declare function normalizeWireSize(wireSize: number | undefined, decodedSize: number): number;
export declare function getRouteCooldown(failures?: number): number;
export declare function formatSnapshot(snapshot?: MarketPerformanceSnapshot): string;
export declare function formatRouteScores(routes?: MarketPerformance['routeScores']): string;
export declare function formatCacheEntries(entries: Dict<CacheEntry>): string;
export declare function normalizeCacheStore(value: any): CacheStore;
export declare function isLegacyInlineCacheStore(value: any): boolean;
export declare function normalizePersistedRouteStats(value: any): Dict<PersistedRouteStats> | undefined;
export declare function normalizeCacheEntry(value: any): CacheEntry | undefined;
export declare function hasCacheResultReference(value: any): value is CacheEntry;
export declare function clamp(value: number, min: number, max: number): number;
export declare function waitFor(task: Promise<any>, timeout: number): Promise<boolean>;
export declare function formatTimings(timings?: Dict<number>): string;

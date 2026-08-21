import { Context, Dict } from 'koishi';
import type { SearchResult } from '@koishijs/registry';
import { type CacheEntry, type CacheFile, type CacheMeta, type EndpointResult, type LogLevel, type MarketProviderConfig, type PersistedRouteStats } from './market-internals';
interface MarketDiskCacheOptions {
    getEndpointCandidates: () => string[];
    getRouteScore: (endpoint: string) => number;
    getRouteStats: () => Dict<PersistedRouteStats>;
    restoreRouteStats: (stats: Dict<PersistedRouteStats>) => void;
    isStale: (serial: number) => boolean;
    isActive: () => boolean;
    log: (level: Exclude<LogLevel, 'silent'>, message: string) => void;
}
export interface LoadedMarketDiskCache {
    entry: CacheFile;
    readElapsed: number;
    parseElapsed: number;
    start: number;
}
export declare class MarketDiskCache {
    private ctx;
    private config;
    private options;
    readonly file: string;
    readonly directory: string;
    entries: Dict<CacheEntry>;
    private loadedMeta?;
    private conditionMeta?;
    private result?;
    private writeTimer?;
    private routeStatsWriteTimer?;
    private maintenanceTimers;
    constructor(ctx: Context, config: MarketProviderConfig, options: MarketDiskCacheOptions);
    get diskMeta(): CacheMeta;
    get currentMeta(): CacheMeta;
    get currentResult(): SearchResult;
    dispose(): void;
    clearDiskMeta(): void;
    getConditionalHeaders(endpoint: string): Dict<string>;
    updateFromEndpoint(result: EndpointResult): void;
    load(serial: number): Promise<LoadedMarketDiskCache | undefined>;
    loadEntry(entry: CacheEntry): Promise<CacheFile | undefined>;
    scheduleWrite(result: SearchResult, meta?: CacheMeta): void;
    scheduleRouteStatsWrite(): void;
    activate(entry: CacheFile): void;
    private pick;
    private getScore;
    private getEntryFilename;
    private createSplitEntry;
    private writeEntryFile;
    private pruneSplitFiles;
    private writeRouteStats;
    private pruneEntries;
    private writeStore;
    private scheduleMaintenance;
}
export {};

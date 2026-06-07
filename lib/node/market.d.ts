import { Context, Dict, Schema } from 'koishi';
import { SearchObject } from '@koishijs/registry';
import { MarketPerformance, MarketProvider as BaseMarketProvider } from '../shared';
export declare const DEFAULT_ENDPOINT = "https://registry.koishi.t4wefan.pub/index.json";
declare const logLevels: readonly ["silent", "error", "warn", "info", "debug"];
type LogLevel = typeof logLevels[number];
declare class MarketProvider extends BaseMarketProvider {
    config: MarketProvider.Config;
    private http;
    private failed;
    private scanner;
    private fullCache;
    private tempCache;
    private payload?;
    private endpoint;
    private disposed;
    private serial;
    private forceRefresh;
    private indexMode;
    private cacheFile;
    private cacheMeta?;
    private conditionMeta?;
    private cacheResult?;
    private debugInfo?;
    private backgroundTask?;
    private cacheWriteTimer?;
    private flushData;
    constructor(ctx: Context, config?: MarketProvider.Config);
    start(refresh?: boolean): Promise<void>;
    collect(): Promise<any>;
    private fetchIndex;
    private getEndpoints;
    private getPreferredEndpoint;
    private waitRouteTurn;
    private getConditionalHeaders;
    private updateCacheState;
    private fetchEndpoint;
    get(): Promise<{
        registry: string;
        data: Dict<SearchObject>;
        failed: number;
        total: number;
        progress: number;
        gravatar: string;
        stale: boolean;
        error: any;
        cached: boolean;
        cachedAt: number;
        validatedAt: number;
        refreshing: boolean;
        debug: MarketPerformance;
    } | {
        debug: MarketPerformance;
        registry?: string;
        data: Dict<SearchObject>;
        total: number;
        failed: number;
        progress: number;
        gravatar?: string;
        stale?: boolean;
        error?: string;
        cached?: boolean;
        cachedAt?: number;
        validatedAt?: number;
        refreshing?: boolean;
    }>;
    private applyIndex;
    private applyDiskCache;
    private scheduleDiskCacheWrite;
    private writeDiskCache;
    private refreshInBackground;
    private refreshIndexInBackground;
    private updateDebugInfo;
    private getDebugInfo;
    private isStale;
    private log;
}
declare namespace MarketProvider {
    interface Config {
        endpoint?: string;
        timeout?: number;
        proxyAgent?: string;
        autoRoute?: boolean;
        logLevel?: LogLevel;
    }
    const Config: Schema<Config>;
}
export default MarketProvider;

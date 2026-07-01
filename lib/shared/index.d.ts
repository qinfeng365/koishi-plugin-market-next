import { Context, Dict } from 'koishi';
import { DataService } from '@koishijs/console';
import { SearchObject, SearchResult } from '@koishijs/registry';
export * from './bundle';
export interface RegistryStatus {
    loading?: boolean;
    reason?: 'timeout' | 'not-found' | 'network' | 'invalid' | 'http' | 'unknown';
    error?: string;
    endpoint?: string;
    attempts?: number;
    elapsed?: number;
    updatedAt?: number;
}
export interface MarketPerformanceSnapshot {
    source?: 'network' | 'disk-cache' | 'http-304' | 'hash-cache' | 'legacy';
    endpoint?: string;
    preferredEndpoint?: string;
    fallbackReason?: 'primary-failed' | 'primary-slow' | 'rescue';
    candidates?: number;
    size?: number;
    wireSize?: number;
    contentEncoding?: string;
    objects?: number;
    hash?: string;
    etag?: string;
    lastModified?: string;
    cachedAt?: number;
    validatedAt?: number;
    timings?: Dict<number>;
}
export interface MarketRouteScore {
    endpoint: string;
    score: number;
    successes?: number;
    failures?: number;
    consecutiveFailures?: number;
    cooldownUntil?: number;
    coolingDown?: boolean;
    averageElapsed?: number;
    lastSuccess?: number;
    contentEncoding?: string;
    cached?: boolean;
    cachedAt?: number;
}
export interface MarketPerformance extends MarketPerformanceSnapshot {
    initial?: MarketPerformanceSnapshot;
    refresh?: MarketPerformanceSnapshot;
    routeScores?: MarketRouteScore[];
}
declare module '@koishijs/console' {
    interface Events {
        'market/refresh'(): Promise<void>;
        'market/refresh-dependencies'(): Promise<void>;
    }
    namespace Console {
        interface Services {
            market: MarketProvider;
        }
    }
}
export declare abstract class MarketProvider extends DataService<MarketProvider.Payload> {
    protected _task: Promise<any>;
    private _timestamp;
    protected _error: any;
    constructor(ctx: Context);
    start(refresh?: boolean): Promise<void>;
    abstract collect(): Promise<void | SearchResult>;
    probeInBackground?(reason?: string): Promise<boolean>;
    prepare(): Promise<SearchResult>;
}
export declare namespace MarketProvider {
    interface Payload {
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
        serverNow?: number;
        refreshing?: boolean;
        loading?: boolean;
        debug?: MarketPerformance;
    }
}

import { Context } from 'koishi';
import { MarketDiskCache } from './market-cache';
import { type EndpointResult, type LogLevel, type MarketProviderConfig } from './market-internals';
interface MarketEndpointFetcherOptions {
    isStale: (serial: number) => boolean;
    log: (level: Exclude<LogLevel, 'silent'>, message: string) => void;
}
interface MarketEndpointRequest {
    endpoint: string;
    index: number;
    total: number;
    serial: number;
    warnFailure?: boolean;
    signal?: AbortSignal;
}
export declare class MarketEndpointFetcher {
    private ctx;
    private config;
    private cache;
    private options;
    constructor(ctx: Context, config: MarketProviderConfig, cache: MarketDiskCache, options: MarketEndpointFetcherOptions);
    fetch(request: MarketEndpointRequest): Promise<EndpointResult>;
    private requestEndpoint;
    private reuseNotModified;
    private decodeResponse;
    private reuseHashCache;
    private parseNetworkResult;
    private assertActive;
}
export {};

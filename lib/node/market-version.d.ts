import { Context } from 'koishi';
import { type LogLevel, type MarketProviderConfig } from './market-internals';
interface VersionedMarketSource {
    endpoint: string;
    versionUrl: string;
    authority: number;
    authoritative?: boolean;
}
export interface MarketVersionResolution {
    hash: string;
    witnesses: string[];
    candidates: number;
    elapsed: number;
}
export declare function getVersionedMarketSource(endpoint: string): VersionedMarketSource;
export declare function getVersionedMarketIndexUrl(endpoint: string, hash: string): string;
export declare class MarketVersionResolver {
    private ctx;
    private config;
    private log;
    constructor(ctx: Context, config: MarketProviderConfig, log: (level: Exclude<LogLevel, 'silent'>, message: string) => void);
    resolve(endpoints: string[], signal?: AbortSignal): Promise<MarketVersionResolution | undefined>;
    private fetchVersion;
    private isInternalAbort;
}
export {};

import { Context, Dict } from 'koishi';
import { DataService } from '@koishijs/console';
import type { PluginBundleRecord } from '../shared/bundle';
export interface UpdateIgnoreRule {
    version?: string;
    count?: number;
    until?: number;
    ignoredAt?: number;
}
export interface MarketDataStorePayload {
    override: Dict<string>;
    updateIgnored: Dict<string | UpdateIgnoreRule>;
    bundleRecords: Dict<PluginBundleRecord>;
}
export declare class MarketDataStore extends DataService<MarketDataStorePayload> {
    ctx: Context;
    private file;
    private data;
    private ready?;
    private writeTask?;
    private writeTimer?;
    private writePending;
    constructor(ctx: Context);
    get(): Promise<MarketDataStorePayload>;
    patch(patch: Partial<MarketDataStorePayload>): Promise<MarketDataStorePayload>;
    setBundleRecord(record: PluginBundleRecord): Promise<MarketDataStorePayload>;
    migrateFromConfig(config: {
        updateIgnored?: Dict<string | UpdateIgnoreRule>;
        bundleRecords?: Dict<PluginBundleRecord>;
    }): Promise<void>;
    private snapshot;
    private load;
    private scheduleWrite;
    private flushWrite;
    private flushWriteNow;
    private write;
}

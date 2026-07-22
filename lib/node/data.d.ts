import { Context, Dict } from 'koishi';
import { DataService } from '@koishijs/console';
import type { PluginBundleRecord } from '../shared/bundle';
import type { UpdateIgnoreRule } from '../shared/update';
export type { UpdateIgnoreRule } from '../shared/update';
export interface MarketDataStorePayload {
    override: Dict<string>;
    updateIgnored: Dict<string | UpdateIgnoreRule>;
    bundleRecords: Dict<PluginBundleRecord>;
    collapsedGroups: Dict<boolean>;
}
export declare function readMarketDataStore(ctx: Context): Promise<MarketDataStorePayload>;
export declare class MarketDataStore extends DataService<MarketDataStorePayload> {
    ctx: Context;
    private file;
    private data;
    private ready?;
    private writeTask?;
    private writeTimer?;
    private writePending;
    private hasCollapsedGroupsState;
    private collapsedGroupsVersion;
    constructor(ctx: Context);
    get(): Promise<MarketDataStorePayload>;
    patch(patch: Partial<MarketDataStorePayload>): Promise<MarketDataStorePayload>;
    setBundleRecord(record: PluginBundleRecord): Promise<MarketDataStorePayload>;
    migrateFromConfig(config: {
        updateIgnored?: Dict<string | UpdateIgnoreRule>;
        bundleRecords?: Dict<PluginBundleRecord>;
        collapsedGroups?: Dict<boolean>;
    }): Promise<void>;
    private snapshot;
    private load;
    private scheduleWrite;
    private flushWrite;
    private flushWriteNow;
    private write;
}

import { Context, Dict, Schema } from 'koishi';
import Installer from './installer';
import MarketProvider from './market';
import type { PluginBundleRecord } from '../shared/bundle';
export interface Config {
    registry?: Installer.Config;
    search?: MarketProvider.Config;
    chatlunaTool?: boolean;
    frontendMode?: 'performance' | 'polished';
    depsLayout?: 'grid' | 'list';
    marketSilentStatusRules?: MarketSilentStatusRule[];
    marketSilentDateRules?: MarketSilentDateRule[];
    marketSilentRecentRules?: MarketSilentRecentRule[];
    marketSilentCustomRules?: MarketSilentCustomRule[];
    marketSilentRules?: MarketSilentRule[];
    marketSilentFilters?: string;
    idleProbe?: boolean;
    idleProbeDelay?: number;
    idleProbeBootDelay?: number;
    idleProbeInterval?: number;
    bulkMode?: boolean;
    removeConfig?: boolean;
    updateIgnoredPackages?: string;
    updateIgnoreDuration?: number;
    updateIgnoreVersions?: number;
    updateIgnorePrerelease?: boolean;
    collapsedGroups?: Dict<boolean>;
    updateIgnored?: Dict<any>;
    bundleRecords?: Dict<PluginBundleRecord>;
}
interface MarketSilentStatusRule {
    target?: 'preview' | 'insecure' | 'bundle';
    note?: string;
    enabled?: boolean;
}
interface MarketSilentDateRule {
    field?: 'created' | 'updated';
    relation?: 'before' | 'after';
    date?: string;
    note?: string;
    enabled?: boolean;
}
interface MarketSilentRecentRule {
    field?: 'created' | 'updated';
    days?: number;
    note?: string;
    enabled?: boolean;
}
interface MarketSilentCustomRule {
    query?: string;
    note?: string;
    enabled?: boolean;
}
interface MarketSilentRule {
    type?: 'custom' | 'preview' | 'insecure' | 'bundle' | 'created-before' | 'created-after' | 'updated-before' | 'updated-after' | 'created-within' | 'updated-within';
    value?: string;
    date?: string;
    days?: number;
    query?: string;
    note?: string;
    enabled?: boolean;
}
export declare const Config: Schema<Config>;
export declare function ensureMarketNextConfigDefaults(ctx: Context, currentConfig: Config): boolean;
export declare function removeLegacyCollapsedGroupsConfig(ctx: Context, currentConfig: Config): boolean;
export declare function updateMarketNextConfig(ctx: Context, currentConfig: Config, patch: Partial<Config>): Promise<boolean>;
export {};

import { Context, Dict, Schema } from 'koishi';
import { DependencyMetaKey, Registry, RemotePackage } from '@koishijs/registry';
import { DependencyProvider, RegistryProvider, RegistryStatusProvider } from './deps';
import { MarketDataStore, MarketDataStorePayload } from './data';
import Installer, { InstallFallbackCandidate, InstallHistoryEntry, InstallLogDetail, InstallOptions } from './installer';
import MarketProvider from './market';
import { BundleConfigRemoveRequest, BundleConfigRemoveResult, BundleInstallRequest, BundleInstallResult, PluginBundleRecord } from '../shared/bundle';
export * from '../shared';
export { Installer };
export type { InstallHistoryChange, InstallHistoryEntry, InstallHistoryStatus, InstallLogDetail } from './installer';
declare module 'koishi' {
    interface Context {
        installer: Installer;
    }
}
declare module '@koishijs/console' {
    namespace Console {
        interface Services {
            dependencies: DependencyProvider;
            registry: RegistryProvider;
            registryStatus: RegistryStatusProvider;
            marketData: MarketDataStore;
        }
    }
    interface Events {
        'market/install'(deps: Dict<string>, forced?: boolean, options?: InstallOptions): Promise<number>;
        'market/install-bundle'(request: BundleInstallRequest, forced?: boolean, options?: InstallOptions): Promise<BundleInstallResult>;
        'market/install-fallback-candidate'(failedEndpoint?: string): Promise<InstallFallbackCandidate | undefined>;
        'market/install-history'(limit?: number): Promise<InstallHistoryEntry[]>;
        'market/install-history-detail'(id: string): Promise<InstallLogDetail | undefined>;
        'market/install-history-rollback'(id: string, options?: InstallOptions): Promise<number>;
        'market/remove-bundle-configs'(request: BundleConfigRemoveRequest): Promise<BundleConfigRemoveResult>;
        'market/update-config'(patch: Partial<Config>): Promise<boolean>;
        'market/update-data'(patch: Partial<MarketDataStorePayload>): Promise<MarketDataStorePayload>;
        'market/refresh-dependencies'(): Promise<void>;
        'market/package'(name: string): Promise<Registry>;
        'market/registry'(names: string[]): Promise<Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>>;
        'market/ensure-config'(name: string): Promise<boolean>;
        'market/avatar'(key: string, url?: string): Promise<AvatarFetchResult | undefined>;
    }
}
export declare const name = "market";
export declare const inject: string[];
export declare const usage = "\n\u5982\u679C\u63D2\u4EF6\u5E02\u573A\u9875\u9762\u63D0\u793A\u300C\u65E0\u6CD5\u8FDE\u63A5\u5230\u63D2\u4EF6\u5E02\u573A\u300D\uFF0C\u5219\u53EF\u4EE5\u9009\u62E9\u4E00\u4E2A Koishi \u793E\u533A\u63D0\u4F9B\u7684\u955C\u50CF\u5730\u5740\uFF0C\u586B\u5165\u4E0B\u65B9\u5BF9\u5E94\u7684\u914D\u7F6E\u9879\u4E2D\u3002\n\n## \u63D2\u4EF6\u5E02\u573A\uFF08\u586B\u5165 search.endpoint\uFF09\n\n- Koishi\uFF08\u5168\u7403\uFF09\uFF1Ahttps://registry.koishi.chat/index.json\n- [Gitee \u805A\u5408](https://k.ilharp.cc/4000)\uFF08\u5927\u9646\uFF09\uFF1Ahttps://gitee.com/shangxueink/koishi-registry-aggregator/raw/gh-pages/market.json\n- [t4wefan](https://k.ilharp.cc/2611)\uFF08\u5927\u9646\uFF09\uFF1Ahttps://registry.koishi.t4wefan.pub/index.json\n- [Lipraty](https://k.ilharp.cc/3530)\uFF08\u5927\u9646\uFF09\uFF1Ahttps://koi.nyan.zone/registry/index.json\n- [itzdrli](https://k.ilharp.cc/9975)\uFF08\u5168\u7403\uFF09\uFF1Ahttps://kp.itzdrli.cc\n- itzdrli \u5907\u7528\uFF1Ahttps://koishi.itzdrli.cc\n- Koishi Registry GitHub Pages\uFF1Ahttps://koishijs.github.io/registry/index.json\n- Koishi Registry GitHub Raw\uFF1Ahttps://raw.githubusercontent.com/koishijs/registry/release/index.json\n- Koishi Registry jsDelivr\uFF1Ahttps://cdn.jsdelivr.net/gh/koishijs/registry@release/index.json\n- Koishi Registry GitHub \u4EE3\u7406\uFF1Ahttps://ghproxy.net/https://raw.githubusercontent.com/koishijs/registry/release/index.json\n- Koishi Registry GitHub \u4EE3\u7406 2\uFF1Ahttps://ghfast.top/https://raw.githubusercontent.com/koishijs/registry/release/index.json\n\n\u8981\u6D4F\u89C8\u66F4\u591A\u793E\u533A\u955C\u50CF\uFF0C\u8BF7\u8BBF\u95EE [Koishi \u8BBA\u575B\u4E0A\u7684\u955C\u50CF\u4E00\u89C8](https://k.ilharp.cc/4000)\u3002";
export interface Config {
    registry?: Installer.Config;
    search?: MarketProvider.Config;
    chatlunaTool?: boolean;
    frontendMode?: 'performance' | 'polished';
    depsLayout?: 'grid' | 'list';
    marketLayout?: 'grid' | 'list';
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
interface AvatarFetchResult {
    data: string;
    type: string;
    cached?: boolean;
    key?: string;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config?: Config): void;

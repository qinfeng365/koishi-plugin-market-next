import { Context } from 'koishi';
import { BundleConfigRemoveRequest, BundleConfigRemoveResult, PluginBundleManifest } from '../shared/bundle';
export declare function hasPluginConfig(plugins: any, shortname: string): boolean;
export declare function findPluginConfig(plugins: any, shortname: string, group?: any): {
    key: string;
    parent: any;
    inGroup: boolean;
    value: any;
} | undefined;
export declare function hasPluginConfigInGroup(plugins: any, shortname: string): boolean;
export declare function ensurePluginConfig(ctx: Context, name: string, write?: boolean): Promise<boolean>;
export declare function ensurePluginConfigs(ctx: Context, names: string[]): Promise<boolean>;
export declare function ensureInstalledPluginConfigs(ctx: Context): Promise<boolean>;
export interface BundleGroup {
    key: string;
    plugins: any;
    changed?: boolean;
}
export declare function getBundleGroup(ctx: Context, packageName: string): BundleGroup | undefined;
export declare function ensureBundleGroup(ctx: Context, packageName: string, bundle: PluginBundleManifest): BundleGroup | undefined;
export declare function removeBundleConfigs(ctx: Context, request: BundleConfigRemoveRequest): Promise<BundleConfigRemoveResult>;

import type { Dict } from 'koishi';
export interface PluginBundleMember {
    package: string;
    plugin: string;
    version: string;
    required?: boolean;
    config?: Dict;
}
export interface PluginBundleManifest {
    label?: string;
    description?: string;
    members: PluginBundleMember[];
}
export interface PluginBundleValidation {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export interface PluginBundleRecordMember extends PluginBundleMember {
    selected: boolean;
    installedByBundle?: boolean;
    configured?: boolean;
    moved?: boolean;
    skipped?: boolean;
    usePreset?: boolean;
}
export interface PluginBundleRecord {
    package: string;
    version: string;
    label?: string;
    groupKey?: string;
    installedAt: number;
    members: PluginBundleRecordMember[];
}
export interface BundleInstallMember extends PluginBundleMember {
    selected: boolean;
    createConfig: boolean;
    usePreset: boolean;
    conflict?: 'same-group' | 'other-config' | 'package-mismatch';
    move?: boolean;
}
export interface BundleInstallRequest {
    package: string;
    version: string;
    bundle: PluginBundleManifest;
    members: BundleInstallMember[];
}
export interface BundleInstallResult {
    code: number;
    installed: string[];
    configured: string[];
    moved: string[];
    skipped: string[];
    groupKey?: string;
    record?: PluginBundleRecord;
}
export interface BundleConfigRemoveRequest {
    package: string;
    members?: Pick<PluginBundleMember, 'package' | 'plugin'>[];
    removeEmptyGroup?: boolean;
}
export interface BundleConfigRemoveResult {
    groupKey?: string;
    removed: string[];
    removedGroup?: boolean;
}
export declare const BUNDLE_KEYWORD = "market:package";
export declare const BUNDLE_PACKAGE_RE: RegExp;
export declare const PLUGIN_PACKAGE_RE: RegExp;
export declare function isBundlePackageName(name?: string): boolean;
export declare function hasBundleKeyword(keywords?: string[]): boolean;
export declare function isBundleLike(meta: {
    name?: string;
    keywords?: string[];
    koishi?: any;
}): boolean;
export declare function parseBundleManifest(value: any): PluginBundleManifest | undefined;
export declare function validateBundleManifest(packageName: string, bundle?: PluginBundleManifest, options?: {
    keyword?: boolean;
}): PluginBundleValidation;
export declare function getPluginShortname(name: string): string;
export declare function normalizeBundleIdent(value: string): string;
export declare function getBundleGroupIdent(packageName: string): string;
export declare function getBundleMemberIdent(packageName: string, member: Pick<PluginBundleMember, 'package' | 'plugin'>): string;
export declare function scanSensitiveConfig(value: unknown, path?: string): string[];

import { Dict } from 'koishi';
import { DependencyMetaKey, PackageJson, RemotePackage } from '@koishijs/registry';
import type { DependencySource } from '../shared';
export declare const FULL_RELOAD_DELAY = 1000;
export declare const SELF_PACKAGE = "koishi-plugin-market-next";
export interface InstallerConfig {
    endpoint?: string;
    timeout?: number;
    autoRoute?: boolean;
    retry?: number;
    concurrency?: number;
    installLogRetentionHours?: number;
    /** @deprecated use installLogRetentionHours */
    installLogRetention?: number;
}
export interface InstallerGetDepsOptions {
    metadata?: boolean;
    background?: boolean;
}
export interface InstallOptions {
    installEndpoint?: string;
}
export interface InstallFallbackCandidate {
    endpoint: string;
    label: string;
    reason: string;
}
export interface LocalBindingResult {
    request: string;
    filename: string;
    size: number;
}
export interface Dependency {
    /** requested semver range, normalized for display */
    request: string;
    /** installed package version */
    resolved?: string;
    /** whether it is a workspace package */
    workspace?: boolean;
    /** dependency origin used to decide whether npm may manage it */
    source?: DependencySource;
    /** whether this dependency is supplied by a local source */
    local?: boolean;
    /** whether package.json contains a reproducible local source */
    bound?: boolean;
    /** valid but unsupported request syntax */
    invalid?: boolean;
    /** latest registry version */
    latest?: string;
}
export interface YarnLog {
    type: 'warning' | 'info' | 'error' | string;
    name: number | null;
    displayName: string;
    indent?: string;
    data: string;
}
export interface LocalPackage extends PackageJson {
    private?: boolean;
    $workspace?: boolean;
}
export interface PackageManifestSnapshot {
    manifest: PackageJson;
    content: string;
    dependencies: Dict<string>;
}
export declare const levelMap: {
    readonly info: "info";
    readonly warning: "debug";
    readonly error: "warn";
};
export declare function loadManifest(name: string, baseDir?: string): LocalPackage;
export declare function resolvePackageManifest(name: string, baseDir: string): string;
export declare function getVersions(versions: RemotePackage[]): Dict<Pick<RemotePackage, DependencyMetaKey>>;
export declare function sleep(ms: number): Promise<unknown>;
export declare function formatDeps(deps: Dict<string>): string;
export declare function formatLocalDeps(deps: Dict<Dependency>): string;
export declare function pickMetadataProbe(names: string[]): string;

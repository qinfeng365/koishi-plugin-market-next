import { Context, Dict, HTTP, Schema, Service } from 'koishi';
import { DependencyMetaKey, PackageJson, Registry, RemotePackage } from '@koishijs/registry';
import type { RegistryStatus } from '../shared';
export interface Dependency {
    /**
     * requested semver range
     * @example `^1.2.3` -> `1.2.3`
     */
    request: string;
    /**
     * installed package version
     * @example `1.2.5`
     */
    resolved?: string;
    /** whether it is a workspace package */
    workspace?: boolean;
    /** valid (unsupported) syntax */
    invalid?: boolean;
    /** latest version */
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
export declare function loadManifest(name: string): LocalPackage;
declare class Installer extends Service {
    ctx: Context;
    config: Installer.Config;
    http: HTTP;
    endpoint: string;
    fullCache: Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>;
    tempCache: Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>;
    registryStatus: Dict<RegistryStatus>;
    private pkgTasks;
    private agent;
    private manifest;
    private depTask;
    private metadataEndpoint;
    private routeProbeTask?;
    private routeProbeResult?;
    private registryRouteStats;
    private flushData;
    private tempRegistryStatus;
    private flushRegistryStatus;
    private serial;
    constructor(ctx: Context, config?: Installer.Config);
    get cwd(): string;
    start(): Promise<void>;
    private createHttp;
    private resetEndpoint;
    resolveName(name: string): string[];
    findVersion(names: string[]): Promise<{
        [x: string]: string;
    }>;
    private getRegistryEndpoints;
    private getPreferredMetadataEndpoint;
    private getRegistryEndpointCandidates;
    private getRouteProbeEndpoints;
    private ensureMetadataEndpoint;
    private probeMetadataEndpoint;
    private fetchRegistryEndpoint;
    private applyRouteProbeResult;
    private waitRouteTurn;
    private getRegistryRouteScore;
    private recordRegistryRouteSuccess;
    private recordRegistryRouteFailure;
    private getFallbackDelay;
    private getRegistryRouteScores;
    private isStale;
    private setRegistryStatus;
    private clearRegistryStatus;
    getRegistry(name: string, serial?: number): Promise<Registry>;
    private formatRegistryError;
    private _getPackage;
    setPackage(name: string, versions: RemotePackage[]): void;
    getPackage(name: string): Promise<Dict<Pick<RemotePackage, DependencyMetaKey>>>;
    private _getDeps;
    getDeps(): Promise<Dict<Dependency>>;
    refreshData(): Promise<void>;
    refresh(refresh?: boolean): Promise<void>;
    exec(args: string[]): Promise<number>;
    override(deps: Dict<string>): Promise<void>;
    private _install;
    private _getLocalDeps;
    install(deps: Dict<string>, forced?: boolean, beforeReload?: () => unknown | Promise<unknown>): Promise<number>;
}
declare namespace Installer {
    interface Config {
        endpoint?: string;
        timeout?: number;
        autoRoute?: boolean;
        retry?: number;
        concurrency?: number;
    }
    const Config: Schema<Config>;
}
export default Installer;

import { Context, Dict, HTTP, Schema, Service } from 'koishi';
import { DependencyMetaKey, PackageJson, Registry, RemotePackage } from '@koishijs/registry';
import type { RegistryStatus } from '../shared';
export interface InstallOptions {
    installEndpoint?: string;
}
export interface InstallFallbackCandidate {
    endpoint: string;
    label: string;
    reason: string;
}
export type InstallHistoryStatus = 'running' | 'success' | 'error' | 'unknown';
export interface InstallHistoryChange {
    name: string;
    beforeRequest: string | null;
    beforeResolved: string | null;
    afterRequest: string | null;
    afterResolved: string | null;
}
export interface InstallHistoryEntry {
    id: string;
    startedAt: number;
    finishedAt?: number;
    duration?: number;
    status: InstallHistoryStatus;
    deps: string;
    forced: boolean;
    installEndpoint?: string;
    size: number;
    changes: InstallHistoryChange[];
    rollbackAvailable: boolean;
    rollbackReason?: 'running' | 'not-successful' | 'legacy' | 'unsupported' | 'state-changed';
}
export interface InstallLogDetail extends InstallHistoryEntry {
    content: string;
    truncated: boolean;
}
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
    private depCache;
    private depTask?;
    private depMetadataFresh;
    private metadataEndpoint;
    private routeProbeTask?;
    private routeProbeResult?;
    private registryRouteStats;
    private notFoundCache;
    private statsFile;
    private statsWriteTimer?;
    private flushData;
    private tempRegistryStatus;
    private flushRegistryStatus;
    private pendingControllers;
    private installTask;
    private installActive;
    private installLogFile?;
    private installLogMetadataFile?;
    private installLogMetadata?;
    private installLogWriteTask;
    private installLogCleanupTask?;
    private serial;
    constructor(ctx: Context, config?: Installer.Config);
    get cwd(): string;
    get isInstalling(): boolean;
    start(): Promise<void>;
    private createHttp;
    private loadRouteStats;
    private scheduleStatsWrite;
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
    private raceEndpoints;
    private probeMetadataEndpoint;
    private fetchRegistryEndpoint;
    private applyRouteProbeResult;
    private waitRouteTurn;
    private getRegistryRouteScore;
    private recordRegistryRouteSuccess;
    private recordRegistryRouteFailure;
    private getFallbackDelay;
    private getRegistryRouteScores;
    getInstallFallbackCandidate(failedEndpoint?: string): InstallFallbackCandidate | undefined;
    private fetchRegistryByRoute;
    private isStale;
    private trackController;
    private untrackControllers;
    private abortPendingRequests;
    private isInternalAbort;
    private setRegistryStatus;
    private clearRegistryStatus;
    getRegistry(name: string, serial?: number): Promise<Registry>;
    private formatRegistryError;
    private _getPackage;
    setPackage(name: string, versions: RemotePackage[]): void;
    getPackage(name: string): Promise<any>;
    private getLocalDepsSnapshot;
    private _refreshDependencyMetadata;
    refreshDependencyMetadata(wait?: boolean): Promise<Dict<Dependency>>;
    probeDependenciesInBackground(reason?: string): Promise<void>;
    getDeps(options?: Installer.GetDepsOptions): Dict<Dependency> | Promise<Dict<Dependency>>;
    refreshData(): Promise<void>;
    refresh(refresh?: boolean, waitMetadata?: boolean): Promise<void>;
    private getInstallLogDir;
    private getInstallLogRetention;
    private cleanupInstallLogs;
    private writeInstallLogMetadata;
    private startInstallLog;
    private emitInstallLog;
    private writeInstallLog;
    private finishInstallLog;
    private getInstallLogPath;
    private readInstallLogMetadata;
    private readInstallLog;
    private parseLegacyInstallLog;
    private getRollbackChanges;
    private getInstalledHistoryVersion;
    private assessInstallRollback;
    private createInstallHistoryEntry;
    private getInstallHistoryEntry;
    getInstallHistory(limit?: number): Promise<InstallHistoryEntry[]>;
    getInstallLogDetail(id: string): Promise<InstallLogDetail>;
    exec(args: string[]): Promise<number>;
    override(deps: Dict<string>): Promise<void>;
    private snapshotPackageManifest;
    private restorePackageManifest;
    private _install;
    private _getLocalDeps;
    private validateInstallHistoryState;
    private _installLocked;
    private queueInstall;
    install(deps: Dict<string>, forced?: boolean, beforeReload?: () => unknown | Promise<unknown>, options?: InstallOptions): Promise<number>;
    rollbackInstallHistory(id: string, beforeReload?: () => unknown | Promise<unknown>, options?: InstallOptions): Promise<number>;
    isSelfUpdate(deps: Dict<string>): boolean;
}
declare namespace Installer {
    interface GetDepsOptions {
        metadata?: boolean;
        background?: boolean;
    }
    interface Config {
        endpoint?: string;
        timeout?: number;
        autoRoute?: boolean;
        retry?: number;
        concurrency?: number;
        installLogRetentionHours?: number;
        /** @deprecated use installLogRetentionHours */
        installLogRetention?: number;
    }
    const Config: Schema<Config>;
}
export default Installer;

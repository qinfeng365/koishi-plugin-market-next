import { Context, Dict, Schema, Service } from 'koishi';
import { RemotePackage } from '@koishijs/registry';
import { type LocalPackageUploadChunkRequest, type LocalPackageUploadCommitResult, type LocalPackageUploadFinishRequest, type LocalPackageUploadPreview, type LocalPackageUploadProgress, type LocalPackageUploadStartRequest, type LocalPackageUploadStartResult } from './local-upload';
import { EnvironmentSnapshotPreview, EnvironmentSnapshotSummary } from './environment';
import { type InstallHistoryEntry, type InstallLogDetail } from './install-history';
import { type Dependency, type InstallerConfig, type InstallerGetDepsOptions, type InstallFallbackCandidate, type InstallOptions, type LocalBindingResult } from './installer-types';
export { loadManifest } from './installer-types';
export type { Dependency, InstallFallbackCandidate, InstallOptions, LocalBindingResult, LocalPackage, YarnLog, } from './installer-types';
export type { InstallHistoryChange, InstallHistoryEntry, InstallHistoryStatus, InstallLogDetail, } from './install-history';
declare class Installer extends Service {
    ctx: Context;
    config: Installer.Config;
    private manifest;
    private depCache;
    private depTask?;
    private depMetadataFresh;
    private installTask;
    private installActive;
    private metadata;
    private installHistory;
    private environmentSnapshots;
    private localPackageUploads;
    private packageManager;
    constructor(ctx: Context, config?: Installer.Config);
    get cwd(): string;
    get isInstalling(): boolean;
    get http(): import("koishi").HTTP;
    get endpoint(): string;
    get fullCache(): Dict<Dict<Pick<RemotePackage, import("@koishijs/registry").DependencyMetaKey>>>;
    get tempCache(): Dict<Dict<Pick<RemotePackage, import("@koishijs/registry").DependencyMetaKey>>>;
    get registryStatus(): Dict<import(".").RegistryStatus>;
    start(): Promise<void>;
    resolveName(name: string): string[];
    findVersion(names: string[]): Promise<{
        [x: string]: string;
    }>;
    getInstallFallbackCandidate(failedEndpoint?: string): InstallFallbackCandidate | undefined;
    getRegistry(name: string, serial?: number): Promise<import("@koishijs/registry").Registry>;
    setPackage(name: string, versions: RemotePackage[]): void;
    getPackage(name: string): Promise<any>;
    private formatRegistryError;
    private isStale;
    private markRegistryNotFoundDependency;
    private getLocalDepsSnapshot;
    private _refreshDependencyMetadata;
    refreshDependencyMetadata(wait?: boolean): Promise<Dict<Dependency>>;
    probeDependenciesInBackground(reason?: string): Promise<void>;
    getDeps(options?: Installer.GetDepsOptions): Dict<Dependency> | Promise<Dict<Dependency>>;
    refreshData(): Promise<void>;
    refresh(refresh?: boolean, waitMetadata?: boolean): Promise<void>;
    private startInstallLog;
    private emitInstallLog;
    private finishInstallLog;
    getInstallHistory(limit?: number): Promise<InstallHistoryEntry[]>;
    getInstallLogDetail(id: string): Promise<InstallLogDetail>;
    getEnvironmentSnapshots(): Promise<EnvironmentSnapshotSummary[]>;
    getEnvironmentSnapshotPreview(id: string): Promise<EnvironmentSnapshotPreview | undefined>;
    exec(args: string[]): Promise<number>;
    override(deps: Dict<string>): Promise<void>;
    private snapshotPackageManifest;
    private restorePackageManifest;
    private _install;
    private _getLocalDeps;
    private captureCurrentEnvironmentSnapshot;
    private recordCurrentEnvironmentSnapshot;
    private _installLocked;
    private withInstallLock;
    private queueInstall;
    install(deps: Dict<string>, forced?: boolean, beforeReload?: () => unknown | Promise<unknown>, options?: InstallOptions): Promise<number>;
    startLocalPackageUpload(request: LocalPackageUploadStartRequest): Promise<LocalPackageUploadStartResult>;
    appendLocalPackageUpload(request: LocalPackageUploadChunkRequest): Promise<LocalPackageUploadProgress>;
    finishLocalPackageUpload(request: LocalPackageUploadFinishRequest): Promise<LocalPackageUploadPreview>;
    commitLocalPackageUpload(uploadId: string): Promise<LocalPackageUploadCommitResult>;
    cancelLocalPackageUpload(uploadId: string): Promise<boolean>;
    prepareLocalBinding(name: string): Promise<LocalBindingResult>;
    applyEnvironmentSnapshot(id: string, options?: InstallOptions): Promise<number>;
    isSelfUpdate(deps: Dict<string>): boolean;
}
declare namespace Installer {
    interface GetDepsOptions extends InstallerGetDepsOptions {
    }
    interface Config extends InstallerConfig {
    }
    const Config: Schema<Config>;
}
export default Installer;

import { Context, Dict } from 'koishi';
import { type Dependency, type InstallerConfig, type InstallOptions } from './installer-types';
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
}
export interface InstallLogDetail extends InstallHistoryEntry {
    content: string;
    truncated: boolean;
}
export declare class InstallHistoryStore {
    private ctx;
    private config;
    private getResolvedVersion;
    private logFile?;
    private metadataFile?;
    private metadata?;
    private writeTask;
    private cleanupTask?;
    constructor(ctx: Context, config: InstallerConfig, getResolvedVersion: (name: string) => string | undefined);
    get currentId(): string;
    resetCurrent(): void;
    cleanup(): Promise<void>;
    start(deps: Dict<string>, forced?: boolean, options?: InstallOptions, changes?: InstallHistoryChange[]): Promise<void>;
    emit(type: 'stdout' | 'stderr', line: string): void;
    finish(result?: {
        code?: number | null;
        failed?: boolean;
        reason?: string;
    }): Promise<void>;
    getHistory(limit?: number): Promise<InstallHistoryEntry[]>;
    getDetail(id: string): Promise<InstallLogDetail>;
    private getDirectory;
    private getRetention;
    private writeMetadata;
    private write;
    private getPath;
    private readMetadata;
    private readLog;
    private parseLegacy;
    private createEntry;
    private getEntry;
}
export declare function createInstallHistoryChanges(before: Dict<string>, after: Dict<string>, localDeps: Dict<Dependency>): InstallHistoryChange[];

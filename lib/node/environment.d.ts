import type { Dict } from 'koishi';
export interface EnvironmentDependencySnapshot {
    request: string;
    resolved?: string;
    workspace?: boolean;
    invalid?: boolean;
}
export type EnvironmentSnapshotSource = 'startup' | 'operation' | 'external';
export interface EnvironmentSnapshot {
    id: string;
    createdAt: number;
    lastSeenAt?: number;
    source: EnvironmentSnapshotSource;
    operationId?: string;
    dependencies: Dict<EnvironmentDependencySnapshot>;
}
export interface EnvironmentSnapshotSummary {
    id: string;
    createdAt: number;
    lastSeenAt?: number;
    source: EnvironmentSnapshotSource;
    operationId?: string;
    dependencyCount: number;
    current: boolean;
}
export type EnvironmentChangeStatus = 'upgrade' | 'downgrade' | 'added' | 'removed' | 'changed' | 'unchanged' | 'unsupported';
export interface EnvironmentSnapshotChange {
    name: string;
    currentRequest?: string;
    currentVersion?: string;
    targetRequest?: string;
    targetVersion?: string;
    status: EnvironmentChangeStatus;
    reason?: 'workspace';
}
export interface EnvironmentSnapshotPreview {
    snapshot: EnvironmentSnapshotSummary;
    changes: EnvironmentSnapshotChange[];
    actionableCount: number;
    unsupportedCount: number;
}
export declare function normalizeEnvironmentDependencies(dependencies: Dict<EnvironmentDependencySnapshot>): Dict<EnvironmentDependencySnapshot>;
export declare function getEnvironmentSnapshotId(dependencies: Dict<EnvironmentDependencySnapshot>): string;
export declare function createEnvironmentSnapshot(dependencies: Dict<EnvironmentDependencySnapshot>, source: EnvironmentSnapshotSource, operationId?: string, now?: number): EnvironmentSnapshot;
export declare function getEnvironmentDiff(current: EnvironmentSnapshot, target: EnvironmentSnapshot): EnvironmentSnapshotChange[];
export declare function getEnvironmentInstallChanges(diff: EnvironmentSnapshotChange[], target: EnvironmentSnapshot): Dict<string>;
export declare function summarizeEnvironmentSnapshot(snapshot: EnvironmentSnapshot, currentId?: string): EnvironmentSnapshotSummary;
export declare class EnvironmentSnapshotStore {
    private readonly filename;
    private readonly onError;
    private loaded?;
    private writeTask;
    private value;
    constructor(filename: string, onError: (message: string) => void);
    private load;
    private waitForWrites;
    private persist;
    record(snapshot: EnvironmentSnapshot): Promise<EnvironmentSnapshot>;
    list(): Promise<EnvironmentSnapshot[]>;
    get(id: string): Promise<EnvironmentSnapshot>;
}

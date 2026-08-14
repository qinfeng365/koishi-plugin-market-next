import { PackageJson } from '@koishijs/registry';
export type LocalPackageOperation = 'install' | 'upgrade' | 'downgrade' | 'replace';
export interface LocalPackageUploadStartRequest {
    filename: string;
    size: number;
}
export interface LocalPackageUploadStartResult {
    uploadId: string;
    chunkSize: number;
    maxSize: number;
}
export interface LocalPackageUploadChunkRequest {
    uploadId: string;
    index: number;
    data: string;
}
export interface LocalPackageUploadProgress {
    received: number;
    size: number;
}
export interface LocalPackageUploadFinishRequest {
    uploadId: string;
}
export interface LocalPackageUploadPreview {
    uploadId: string;
    filename: string;
    name: string;
    version: string;
    description?: string;
    size: number;
    hash: string;
    scripts: string[];
    currentRequest?: string;
    currentVersion?: string;
    operation: LocalPackageOperation;
}
export interface LocalPackageUploadCommitResult {
    name: string;
    version: string;
    filename: string;
    request: string;
    size: number;
    hash: string;
}
interface ValidatedLocalPackage {
    manifest: PackageJson;
    hash: string;
    targetFilename: string;
}
export declare class LocalPackageUploadStore {
    private readonly warn;
    private readonly root;
    private readonly temporaryRoot;
    private readonly sessions;
    constructor(baseDir: string, warn: (message: string) => void);
    start(request: LocalPackageUploadStartRequest): Promise<LocalPackageUploadStartResult>;
    append(request: LocalPackageUploadChunkRequest): Promise<LocalPackageUploadProgress>;
    finish(request: LocalPackageUploadFinishRequest): Promise<ValidatedLocalPackage & {
        uploadId: string;
        filename: string;
        size: number;
    }>;
    commit(uploadId: string): Promise<LocalPackageUploadCommitResult>;
    cancel(uploadId: string): Promise<boolean>;
    pruneExpired(now?: number): Promise<void>;
    dispose(): Promise<void>;
    private getSession;
    private closeHandle;
    private removeSession;
}
export declare function getLocalPackageOperation(currentRequest: string | undefined, currentVersion: string | undefined, targetVersion: string): LocalPackageOperation;
export {};

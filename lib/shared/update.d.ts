export interface UpdateIgnoreRule {
    version?: string;
    count?: number;
    until?: number;
    ignoredAt?: number;
}
export type IgnoredUpdates = Record<string, string | UpdateIgnoreRule | undefined>;
export interface UpdateIgnorePolicy {
    updateIgnored?: IgnoredUpdates;
    updateIgnoredPackages?: string;
    updateIgnoreVersions?: number;
    updateIgnorePrerelease?: boolean;
}
export declare function normalizeUpdateIgnoreRule(value?: string | UpdateIgnoreRule): UpdateIgnoreRule;
export declare function normalizeUpdateIgnoreCount(value?: number): number;
export declare function parseUpdateIgnoredPackages(value?: string): Set<string>;
export declare function isUpdateCheckDisabled(name: string, policy?: UpdateIgnorePolicy): boolean;
export declare function getUpdateCandidates(versions: Iterable<string>, resolved?: string, policy?: UpdateIgnorePolicy): string[];
export declare function isUpdateVersionIgnored(name: string, version: string, candidates: string[], policy?: UpdateIgnorePolicy, now?: number): boolean;
export declare function getLatestAllowedUpdate(name: string, versions: Iterable<string>, resolved?: string, policy?: UpdateIgnorePolicy, now?: number): string;

export type DependencySource = 'registry' | 'workspace' | 'file' | 'link' | 'portal' | 'git' | 'url' | 'unbound';
export interface DependencySourceInfo {
    source: DependencySource;
    local: boolean;
    bound: boolean;
}
export interface DependencySourceOptions {
    workspace?: boolean;
    installed?: boolean;
    discoveredLocal?: boolean;
    registryNotFound?: boolean;
}
export interface DependencySourceState {
    request?: string;
    resolved?: string;
    source?: DependencySource;
    local?: boolean;
    bound?: boolean;
    workspace?: boolean;
}
export interface DiscoveredLocalPluginOptions {
    declared?: boolean;
    configured?: boolean;
    running?: boolean;
    workspace?: boolean;
}
export declare function classifyDependencySource(request?: string, options?: DependencySourceOptions): DependencySourceInfo;
export declare function classifyRegistryNotFoundDependency(dependency: DependencySourceState | undefined, plugin: boolean): DependencySourceInfo | undefined;
export declare function reuseConfirmedDependencySource(previous: DependencySourceState | undefined, current: DependencySourceState | undefined, confirmationFresh: boolean): DependencySourceInfo | undefined;
export declare function findUnboundLocalDependencies(dependencies: Record<string, DependencySourceState | undefined>, changes: Record<string, string | undefined>): string[];
export declare function findDependenciesNeedingSourceCheck(dependencies: Record<string, DependencySourceState | undefined>, changes: Record<string, string | undefined>, completedNames: Iterable<string>): string[];
export declare function isLocalDependency(dependency?: DependencySourceState): boolean;
export declare function shouldIncludeDiscoveredLocalPlugin(options: DiscoveredLocalPluginOptions): boolean;
export declare function allRegistryAttemptsNotFound(reasons: Array<string | undefined>): boolean;
export declare function getRegistryAttemptReasons(error: unknown, fallback?: string): string[];
export declare function shouldPenalizeRegistryRoute(reason?: string): boolean;

import { Dict } from 'koishi';
import type { Dependency } from './installer-types';
export interface PackageManagerRequirement {
    changes: Dict<string>;
    currentDependencies: Dict<string>;
    currentLocalDeps: Dict<Dependency>;
    nextLocalDeps: Dict<Dependency>;
    forced?: boolean;
}
export interface DependencyRuntimeChange {
    name: string;
    changes: Dict<string>;
    previousDependencies: Dict<string>;
    previousLocalDeps: Dict<Dependency>;
    nextLocalDeps: Dict<Dependency>;
}
export declare function requiresPackageManager(input: PackageManagerRequirement): boolean;
export declare function hasDependencyRuntimeChange(input: DependencyRuntimeChange): boolean;

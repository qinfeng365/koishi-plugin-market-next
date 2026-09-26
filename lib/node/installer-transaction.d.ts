import { Dict } from 'koishi';
import type { PackageJson } from '@koishijs/registry';
import { promises as fsp } from 'fs';
import type { Dependency } from './installer-types';
export declare function applyDependencyOverrides(manifest: PackageJson, changes: Dict<string>): PackageJson;
export declare function writePackageManifest(filename: string, manifest: PackageJson, io?: Pick<typeof fsp, 'writeFile' | 'rename' | 'rm'>): Promise<void>;
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

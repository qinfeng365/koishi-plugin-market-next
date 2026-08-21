import { Dict } from 'koishi';
import { type Dependency, type LocalBindingResult } from './installer-types';
export declare const MAX_LOCAL_BINDING_PACK_SIZE: number;
export interface LocalBindingPackResult {
    name?: string;
    version?: string;
    filename: string;
    size: number;
}
export declare function parseNpmPackOutput(output: string): LocalBindingPackResult;
export declare function createLocalBindingRequest(filename: string): string;
export declare function createHashedLocalBindingFilename(filename: string, hash: string): string;
export declare function prepareLocalBindingPackage(baseDir: string, name: string, dependency: Dependency | undefined, dependencies: Dict<string>, timeout?: number): Promise<LocalBindingResult>;

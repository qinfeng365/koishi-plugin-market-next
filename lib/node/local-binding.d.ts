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

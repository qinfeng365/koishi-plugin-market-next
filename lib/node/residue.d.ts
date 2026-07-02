import { Context } from 'koishi';
export interface ResidueDirectory {
    path: string;
    relative: string;
    size: number;
    files: number;
    modifiedAt?: number;
    source: 'name' | 'source';
    removable: boolean;
    truncated?: boolean;
}
export interface ResidueAnalysis {
    name: string;
    packageRoot?: string;
    installed: boolean;
    directories: ResidueDirectory[];
    sourcePaths: string[];
    warnings: string[];
}
export interface ResidueRemoveResult {
    removed: string[];
    failed: Array<{
        path: string;
        error: string;
    }>;
}
export declare function analyzePluginResidue(ctx: Context, names: string[]): Promise<ResidueAnalysis[]>;
export declare function removeResiduePaths(ctx: Context, paths: string[]): Promise<ResidueRemoveResult>;

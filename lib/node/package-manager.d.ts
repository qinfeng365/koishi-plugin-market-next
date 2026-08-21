import spawn from 'execa';
export interface PackageManagerAgent {
    name: string;
    version: string;
}
export type PackageManagerLogEmitter = (type: 'stdout' | 'stderr', line: string) => void;
export declare class PackageManagerRunner {
    private cwd;
    private agent;
    private emit;
    private spawnProcess;
    constructor(cwd: string, agent: PackageManagerAgent | undefined, emit: PackageManagerLogEmitter, spawnProcess?: typeof spawn);
    exec(args: readonly string[]): Promise<number>;
}

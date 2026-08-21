import { Context, HTTP } from 'koishi';
import type { Registry } from '@koishijs/registry';
import { type RegistryStatus } from '../shared';
import { type InstallFallbackCandidate, type InstallerConfig } from './installer-types';
export interface RegistryEndpointResult {
    endpoint: string;
    registry: Registry;
    elapsed: number;
    fallbackReason?: 'primary-failed' | 'primary-slow';
}
export interface RegistryRouteResult extends RegistryEndpointResult {
    attempts: number;
    lastEndpoint: string;
}
interface RegistryRouteProbeResult extends RegistryEndpointResult {
    serial: number;
    name: string;
}
export declare class RegistryRouter {
    private ctx;
    private config;
    private endpointValue;
    private metadataEndpoint;
    private httpClient;
    private routeProbeTask?;
    private routeProbeResult?;
    private routeStats;
    private statsFile;
    private statsWriteTimer?;
    private pendingControllers;
    private currentSerial;
    constructor(ctx: Context, config: InstallerConfig);
    get serial(): number;
    get endpoint(): string;
    get http(): HTTP;
    get selectedEndpoint(): string;
    get hasRouteProbeResult(): boolean;
    restoreRouteStats(): Promise<void>;
    initializeEndpoint(): Promise<void>;
    reset(reason: string): Promise<void>;
    dispose(): void;
    isStale(serial: number): boolean;
    formatError(error: any): Required<Pick<RegistryStatus, 'reason' | 'error'>>;
    ensureEndpoint(name: string, serial?: number): Promise<void>;
    getRouteProbeResult(name: string, serial: number): RegistryRouteProbeResult;
    selectEndpoint(endpoint: string): void;
    getInstallFallbackCandidate(failedEndpoint?: string): InstallFallbackCandidate | undefined;
    fetchRegistryByRoute(name: string, endpoints: string[], serial: number, onAttempt?: (endpoint: string, attempts: number) => void): Promise<RegistryRouteResult>;
    private createHttp;
    private loadRouteStats;
    private scheduleStatsWrite;
    private resetEndpoint;
    getRegistryEndpoints(): string[];
    private getPreferredMetadataEndpoint;
    private getRegistryEndpointCandidates;
    private getRouteProbeEndpoints;
    private raceEndpoints;
    private probeMetadataEndpoint;
    private fetchRegistryEndpoint;
    private applyRouteProbeResult;
    private waitRouteTurn;
    private getRouteScore;
    private recordRouteSuccess;
    private recordRouteFailure;
    private getFallbackDelay;
    private getRouteScores;
    private trackController;
    private untrackControllers;
    private abortPendingRequests;
    private isInternalAbort;
}
export {};

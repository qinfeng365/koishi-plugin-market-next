import { Logger } from 'koishi';
import { type LogLevel } from './market-internals';
export declare function setLogLevel(level?: LogLevel): void;
export declare function getLogLevel(): LogLevel;
export declare function shouldLog(level: LogLevel, configuredLevel?: "error" | "debug" | "info" | "warn" | "silent"): boolean;
export interface MarketLogContext {
    scope?: {
        isActive?: boolean;
    };
    logger?: (name: string) => Logger;
}
export declare class MarketLogger {
    private name;
    private getContext?;
    private baseLogger;
    constructor(name?: string, getContext?: () => MarketLogContext | undefined);
    private get ctxLogger();
    private isScopeActive;
    log(level: Exclude<LogLevel, 'silent'>, message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
}
export declare const logger: MarketLogger;

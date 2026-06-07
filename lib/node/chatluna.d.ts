import { Context } from 'koishi';
export interface ChatLunaToolConfig {
    chatlunaTool?: boolean;
    search?: {
        endpoint?: string;
        timeout?: number;
        proxyAgent?: string;
    };
}
export declare function applyChatLunaTool(ctx: Context, config?: ChatLunaToolConfig): void;

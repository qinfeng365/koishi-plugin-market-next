import { Context } from 'koishi';
export interface AvatarFetchResult {
    data: string;
    type: string;
    cached?: boolean;
    key?: string;
}
export declare function clearAvatarCacheStorage(ctx: Context): Promise<{
    memory: number;
    disk: number;
}>;
export declare function fetchAvatar(ctx: Context, rawKey: string, rawUrl?: string): Promise<AvatarFetchResult | undefined>;
export declare function startAvatarCacheMaintenance(ctx: Context): () => void;

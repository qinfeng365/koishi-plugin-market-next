import { Context } from 'koishi';
import type { MarketLookupRequest, MarketLookupResult, MarketProvider, MarketSnapshotTransfer } from '../shared';
interface EncodedMarketSnapshot {
    id: string;
    body: Buffer;
    decodedSize: number;
    encodedSize: number;
}
export declare class MarketSnapshotTransport {
    private ctx;
    private route;
    private tasks;
    private entries;
    private memos;
    constructor(ctx: Context, route: string);
    create(snapshot: MarketProvider.Payload): Promise<MarketSnapshotTransfer>;
    get(id: string): EncodedMarketSnapshot;
    clear(): void;
    private prepare;
    private encode;
    private remember;
}
export declare function lookupMarket(provider: MarketProvider | undefined, request?: MarketLookupRequest): Promise<MarketLookupResult>;
export {};

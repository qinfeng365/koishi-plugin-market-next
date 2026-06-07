import { Context, Schema } from 'koishi';
import { MarketProvider as BaseMarketProvider } from '../shared';
export declare const DEFAULT_ENDPOINT = "https://registry.koishi.t4wefan.pub/index.json";
declare class MarketProvider extends BaseMarketProvider {
    config: MarketProvider.Config;
    private http;
    private failed;
    private scanner;
    private fullCache;
    private tempCache;
    private payload?;
    private endpoint;
    private flushData;
    constructor(ctx: Context, config?: MarketProvider.Config);
    start(refresh?: boolean): Promise<void>;
    collect(): Promise<any>;
    private fetchIndex;
    get(): Promise<BaseMarketProvider.Payload>;
}
declare namespace MarketProvider {
    interface Config {
        endpoint?: string;
        timeout?: number;
        proxyAgent?: string;
        autoRoute?: boolean;
    }
    const Config: Schema<Config>;
}
export default MarketProvider;

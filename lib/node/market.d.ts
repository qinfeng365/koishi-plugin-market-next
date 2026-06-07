import { Context, Schema } from 'koishi';
import { SearchObject } from '@koishijs/registry';
import { MarketProvider as BaseMarketProvider } from '../shared';
export declare const DEFAULT_ENDPOINT = "https://registry.koishi.t4wefan.pub/index.json";
declare class MarketProvider extends BaseMarketProvider {
    config: MarketProvider.Config;
    private http;
    private failed;
    private scanner;
    private fullCache;
    private tempCache;
    private flushData;
    constructor(ctx: Context, config?: MarketProvider.Config);
    start(refresh?: boolean): Promise<void>;
    collect(): Promise<any>;
    get(): Promise<{
        data: {};
        failed: number;
        total: number;
        progress: number;
        registry?: undefined;
        gravatar?: undefined;
    } | {
        registry: string;
        data: {
            [k: string]: SearchObject;
        };
        failed: number;
        total: number;
        progress: number;
        gravatar: string;
    }>;
}
declare namespace MarketProvider {
    interface Config {
        endpoint?: string;
        timeout?: number;
        proxyAgent?: string;
    }
    const Config: Schema<Config>;
}
export default MarketProvider;

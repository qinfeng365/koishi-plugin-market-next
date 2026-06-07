import { MarketProvider as BaseMarketProvider } from '../shared';
export default class MarketProvider extends BaseMarketProvider {
    collect(): Promise<import("@koishijs/registry").SearchResult>;
    get(): Promise<{
        data: {
            [k: string]: import("@koishijs/registry").SearchObject;
        };
        failed: number;
        total: number;
        progress: number;
    }>;
}

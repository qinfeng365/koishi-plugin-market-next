import { Context, Dict } from 'koishi';
import { DataService } from '@koishijs/console';
import { SearchObject, SearchResult } from '@koishijs/registry';
declare module '@koishijs/console' {
    interface Events {
        'market/refresh'(): Promise<void>;
    }
    namespace Console {
        interface Services {
            market: MarketProvider;
        }
    }
}
export declare abstract class MarketProvider extends DataService<MarketProvider.Payload> {
    protected _task: Promise<any>;
    private _timestamp;
    protected _error: any;
    constructor(ctx: Context);
    start(refresh?: boolean): Promise<void>;
    abstract collect(): Promise<void | SearchResult>;
    prepare(): Promise<SearchResult>;
}
export declare namespace MarketProvider {
    interface Payload {
        registry?: string;
        data: Dict<SearchObject>;
        total: number;
        failed: number;
        progress: number;
        gravatar?: string;
        stale?: boolean;
        error?: string;
    }
}

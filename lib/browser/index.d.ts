import { Context, Schema } from 'koishi';
import MarketProvider from './market';
export * from './market';
export * from '../shared';
export { MarketProvider };
export declare const filter = false;
export declare const name = "market";
export declare const inject: string[];
export interface Config {
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;

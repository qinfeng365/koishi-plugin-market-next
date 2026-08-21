import { Context } from 'koishi';
import type { Config } from './config';
import { MarketDataStore } from './data';
export declare function setupCommands(ctx: Context, config: Config, getActiveDataStore: () => MarketDataStore | undefined): void;

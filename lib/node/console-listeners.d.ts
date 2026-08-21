import { Context } from 'koishi';
import { Config } from './config';
import { MarketDataStore } from './data';
import { MarketSnapshotTransport } from './market-snapshot';
export declare function setupConsoleListeners(ctx: Context, config: Config, dataStore: MarketDataStore, marketSnapshotTransport: MarketSnapshotTransport): void;

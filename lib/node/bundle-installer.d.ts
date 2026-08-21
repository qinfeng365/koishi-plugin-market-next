import { Context } from 'koishi';
import { MarketDataStore } from './data';
import { type InstallOptions } from './installer-types';
import { BundleInstallRequest, BundleInstallResult } from '../shared/bundle';
export declare function installBundle(ctx: Context, dataStore: MarketDataStore, request: BundleInstallRequest, forced?: boolean, options?: InstallOptions): Promise<BundleInstallResult>;

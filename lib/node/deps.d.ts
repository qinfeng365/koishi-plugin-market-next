import { Context, Dict } from 'koishi';
import { DataService } from '@koishijs/console';
import { DependencyMetaKey, RemotePackage } from '@koishijs/registry';
import { Dependency } from './installer';
import { RegistryStatus } from '../shared';
declare class DependencyProvider extends DataService<Dict<Dependency>> {
    ctx: Context;
    constructor(ctx: Context);
    get(): Promise<Dict<Dependency>>;
}
declare class RegistryProvider extends DataService<Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>> {
    ctx: Context;
    constructor(ctx: Context);
    get(): Promise<Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>>;
}
declare class RegistryStatusProvider extends DataService<Dict<RegistryStatus>> {
    ctx: Context;
    constructor(ctx: Context);
    get(): Promise<Dict<RegistryStatus>>;
}
export { DependencyProvider, RegistryProvider, RegistryStatusProvider };

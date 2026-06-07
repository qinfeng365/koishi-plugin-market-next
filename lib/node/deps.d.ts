import { Context, Dict } from 'koishi';
import { DataService } from '@koishijs/console';
import { DependencyMetaKey, RemotePackage } from '@koishijs/registry';
import { Dependency } from './installer';
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
export { DependencyProvider, RegistryProvider };

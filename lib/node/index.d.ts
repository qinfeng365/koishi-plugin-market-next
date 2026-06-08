import { Context, Dict, Schema } from 'koishi';
import { DependencyMetaKey, Registry, RemotePackage } from '@koishijs/registry';
import { DependencyProvider, RegistryProvider, RegistryStatusProvider } from './deps';
import Installer from './installer';
import MarketProvider from './market';
export * from '../shared';
export { Installer };
declare module 'koishi' {
    interface Context {
        installer: Installer;
    }
}
declare module '@koishijs/console' {
    namespace Console {
        interface Services {
            dependencies: DependencyProvider;
            registry: RegistryProvider;
            registryStatus: RegistryStatusProvider;
        }
    }
    interface Events {
        'market/install'(deps: Dict<string>, forced?: boolean): Promise<number>;
        'market/refresh-dependencies'(): Promise<void>;
        'market/package'(name: string): Promise<Registry>;
        'market/registry'(names: string[]): Promise<Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>>;
        'market/ensure-config'(name: string): Promise<boolean>;
    }
}
export declare const name = "market";
export declare const inject: string[];
export declare const usage = "\n\u5982\u679C\u63D2\u4EF6\u5E02\u573A\u9875\u9762\u63D0\u793A\u300C\u65E0\u6CD5\u8FDE\u63A5\u5230\u63D2\u4EF6\u5E02\u573A\u300D\uFF0C\u5219\u53EF\u4EE5\u9009\u62E9\u4E00\u4E2A Koishi \u793E\u533A\u63D0\u4F9B\u7684\u955C\u50CF\u5730\u5740\uFF0C\u586B\u5165\u4E0B\u65B9\u5BF9\u5E94\u7684\u914D\u7F6E\u9879\u4E2D\u3002\n\n## \u63D2\u4EF6\u5E02\u573A\uFF08\u586B\u5165 search.endpoint\uFF09\n\n- Koishi\uFF08\u5168\u7403\uFF09\uFF1Ahttps://registry.koishi.chat/index.json\n- [Gitee \u805A\u5408](https://k.ilharp.cc/4000)\uFF08\u5927\u9646\uFF09\uFF1Ahttps://gitee.com/shangxueink/koishi-registry-aggregator/raw/gh-pages/market.json\n- [t4wefan](https://k.ilharp.cc/2611)\uFF08\u5927\u9646\uFF09\uFF1Ahttps://registry.koishi.t4wefan.pub/index.json\n- [Lipraty](https://k.ilharp.cc/3530)\uFF08\u5927\u9646\uFF09\uFF1Ahttps://koi.nyan.zone/registry/index.json\n- [itzdrli](https://k.ilharp.cc/9975)\uFF08\u5168\u7403\uFF09\uFF1Ahttps://kp.itzdrli.cc\n- itzdrli \u5907\u7528\uFF1Ahttps://koishi.itzdrli.cc\n\n\u8981\u6D4F\u89C8\u66F4\u591A\u793E\u533A\u955C\u50CF\uFF0C\u8BF7\u8BBF\u95EE [Koishi \u8BBA\u575B\u4E0A\u7684\u955C\u50CF\u4E00\u89C8](https://k.ilharp.cc/4000)\u3002";
export interface Config {
    registry?: Installer.Config;
    search?: MarketProvider.Config;
    chatlunaTool?: boolean;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config?: Config): void;

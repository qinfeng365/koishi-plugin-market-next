import { Context, Dict } from 'koishi'
import { DataService } from '@koishijs/console'
import { DependencyMetaKey, RemotePackage } from '@koishijs/registry'
import { Dependency } from './installer'
import { RegistryStatus } from '../shared'
import { listPluginConfigs } from './plugin-config'

class DependencyProvider extends DataService<Dict<Dependency>> {
  constructor(public ctx: Context) {
    super(ctx, 'dependencies', { authority: 4 })
  }

  async get() {
    return this.ctx.installer.getDeps({ background: false })
  }
}

class RegistryProvider extends DataService<Dict<Dict<Pick<RemotePackage, DependencyMetaKey>>>> {
  constructor(public ctx: Context) {
    super(ctx, 'registry', { authority: 4 })
  }

  async get() {
    return this.ctx.installer.fullCache
  }
}

// Null in a patch for a dependency whose fetch a reset cancelled; see RegistryMetadata.reset.
class RegistryStatusProvider extends DataService<Dict<RegistryStatus | null>> {
  constructor(public ctx: Context) {
    super(ctx, 'registryStatus', { authority: 4 })
  }

  async get() {
    return this.ctx.installer.registryStatus
  }
}

class PluginConfigProvider extends DataService<string[]> {
  constructor(public ctx: Context) {
    super(ctx, 'pluginConfigs', { authority: 4 })
    ctx.on('config', () => this.refresh())
  }

  async get() {
    return [...listPluginConfigs(this.ctx.loader.config?.plugins)]
  }
}

export { DependencyProvider, PluginConfigProvider, RegistryProvider, RegistryStatusProvider }

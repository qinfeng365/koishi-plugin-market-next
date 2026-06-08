import { defineComponent, h, ref, watch } from 'vue'
import { Context, Dict, global, message, receive, router, Schema, send, store, useConfig } from '@koishijs/client'
import type { RegistryStatus } from 'koishi-plugin-market-next'
import { showConfirm, showManual } from './components/utils'
import extensions from './extensions'
import Dependencies from './components/dependencies.vue'
import Install from './components/install.vue'
import Confirm from './components/confirm.vue'
import Market from './components/market.vue'
import Progress from './components/progress.vue'
import './icons'

import 'virtual:uno.css'

declare module '@koishijs/client' {
  interface Config {
    market: MarketConfig
  }
}

interface MarketConfig {
  bulkMode?: boolean
  removeConfig?: boolean
  override?: Dict<string>
  gravatar?: string
}

type MarketStore = typeof store & {
  registryStatus?: Dict<RegistryStatus>
}

receive('market/patch', (data) => {
  store.market = {
    ...data,
    data: {
      ...store.market?.data,
      ...data.data,
    },
  }
})

receive('market/registry', (data) => {
  store.registry = {
    ...store.registry,
    ...data,
  }
})

receive('market/registry-status', (data: Dict<RegistryStatus>) => {
  const target = store as MarketStore
  target.registryStatus = {
    ...target.registryStatus,
    ...data,
  }
})

receive('market/registry-status/clear', () => {
  const target = store as MarketStore
  target.registryStatus = {}
})

export default (ctx: Context) => {
  ctx.plugin(extensions)

  ctx.slot({
    type: 'welcome-choice',
    component: defineComponent(() => () => h('div', {
      class: 'choice',
      onClick: () => router.push('/market'),
    }, [
      h('h2', '浏览插件'),
      h('p', '浏览插件市场中的插件，并根据自己的需要安装和配置。'),
    ])),
  })

  ctx.slot({
    type: 'global',
    component: Install,
  })

  ctx.slot({
    type: 'global',
    component: Confirm,
  })

  ctx.page({
    id: 'market',
    path: '/market',
    name: '插件市场',
    icon: 'activity:market',
    order: 750,
    authority: 4,
    component: Market,
  })

  ctx.settings({
    id: 'market',
    title: '插件市场设置',
    schema: Schema.object({
      market: Schema.object({
        bulkMode: Schema.boolean().default(false).description('批量操作模式。'),
        removeConfig: Schema.union([
          Schema.const(undefined).description('每次询问'),
          Schema.const(true).description('总是'),
          Schema.const(false).description('从不'),
        ]).description('移除插件时是否移除其已经存在的配置。'),
        override: Schema.dict(String).hidden(),
        gravatar: Schema.string().description('Gravatar 镜像地址。'),
      }),
    }),
  })

  const config = useConfig()
  const refreshingMarket = ref(false)
  const refreshingDependencies = ref(false)

  if (!global.static) {
    ctx.slot({
      type: 'status-right',
      component: Progress,
      order: 10,
    })

    ctx.page({
      id: 'dependencies',
      path: '/dependencies',
      name: '依赖管理',
      icon: 'activity:deps',
      order: 700,
      authority: 4,
      fields: ['dependencies', 'registry', 'registryStatus'],
      component: Dependencies,
    })
  }

  ctx.action('market.refresh', {
    shortcut: 'ctrl+r',
    disabled: () => !['market', 'dependencies'].includes(router.currentRoute.value?.meta?.activity.id),
    async action() {
      const activity = router.currentRoute.value?.meta?.activity.id
      const dependencies = activity === 'dependencies'
      const refreshing = dependencies ? refreshingDependencies : refreshingMarket
      if (refreshing.value) return
      refreshing.value = true
      try {
        await send(dependencies ? 'market/refresh-dependencies' : 'market/refresh')
        message.success(dependencies ? '依赖版本已刷新。' : '插件市场已刷新。')
      } catch (error) {
        console.error(error)
        message.error('刷新失败，请检查网络或日志。')
      } finally {
        refreshing.value = false
      }
    },
  })

  ctx.action('market.install', {
    disabled: () => !Object.keys(config.value.market?.override ?? {}).length,
    action() {
      showConfirm.value = true
    },
  })

  ctx.action('dependencies.manual', {
    action() {
      showManual.value = true
    },
  })

  ctx.menu('market', [{
    id: '.install',
    icon: 'check',
    label: '应用更改',
  }, {
    id: '.refresh',
    icon: 'refresh',
    label: '刷新',
    type: () => refreshingMarket.value || !store.market || store.market.refreshing || store.market.progress < store.market.total ? 'spin disabled' : '',
  }])

  const registryRefreshing = () => {
    const target = store as MarketStore
    return Object.values(target.registryStatus ?? {}).some(status => status.loading)
  }

  ctx.menu('dependencies', [{
    id: '.upgrade',
    icon: 'rocket',
    label: '全部更新',
  }, {
    id: 'market.install',
    icon: 'check',
    label: '应用更改',
  }, {
    id: '.manual',
    icon: 'add',
    label: '手动添加',
  }, {
    id: 'market.refresh',
    icon: 'refresh',
    label: '刷新',
    type: () => refreshingDependencies.value || registryRefreshing() ? 'spin disabled' : '',
  }])

  ctx.effect(() => {
    return watch(() => store.dependencies, (value) => {
      if (!value || !config.value.market) return
      for (const key in config.value.market.override) {
        if (value[key]?.workspace) {
          delete config.value.market.override[key]
        } else if (!config.value.market.override[key] && !value[key]) {
          // package to be removed has been removed
          delete config.value.market.override[key]
        } else if (value[key]?.request === config.value.market.override[key]) {
          // package has been installed to the right version
          delete config.value.market.override[key]
        }
      }
    }, { immediate: true })
  })
}

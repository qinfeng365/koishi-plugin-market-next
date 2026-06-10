import { Context, MenuItem, store } from '@koishijs/client'
import { markRaw, watch } from 'vue'
import ConfigRemove from './config-remove.vue'
import { isProtectedConfigNode, requestConfigRemove } from './config-remove'
import Dependency from './dependency.vue'
import Missing from './missing.vue'
import Select from './select.vue'
import Version from './version.vue'

function patchConfigRemoveLabel(ctx: Context) {
  const patched = new Map<MenuItem, MenuItem['label']>()
  const label: MenuItem['label'] = ({ config }: any) => {
    return config.tree?.children ? '删除分组' : '删除配置'
  }
  const apply = () => {
    const list = ctx.internal.menus['config.tree']
    const index = list?.findIndex(item => item.id === '.remove') ?? -1
    if (index < 0) return
    const item = list[index]
    if (!patched.has(item)) patched.set(item, item.label)
    if (item.label === label) return
    item.label = label
    list.splice(index, 1, item)
  }

  ctx.effect(() => {
    const stop = watch(() => ctx.internal.menus['config.tree']?.map(item => item.id).join('\n'), apply, { immediate: true })
    const timer = setInterval(apply, 500)

    return () => {
      stop()
      clearInterval(timer)
      for (const [item, previous] of patched) {
        const list = ctx.internal.menus['config.tree']
        const index = list?.indexOf(item) ?? -1
        if (item.label === label) item.label = previous
        if (index >= 0) list.splice(index, 1, item)
      }
      patched.clear()
    }
  })
}

function patchConfigRemoveAction(ctx: Context) {
  const action = markRaw({
    disabled: ({ config }: any) => !config.tree?.path || isProtectedConfigNode(config.tree),
    action: ({ config }: any) => requestConfigRemove(config.tree),
  })

  ctx.effect(() => {
    let previous: any

    const apply = () => {
      const current = ctx.internal.actions['config.tree.remove']
      if (current === action) return
      if (current) previous = current
      ctx.internal.actions['config.tree.remove'] = action
    }

    apply()
    const timer = setInterval(apply, 250)

    return () => {
      clearInterval(timer)
      if (ctx.internal.actions['config.tree.remove'] !== action) return
      if (previous) {
        ctx.internal.actions['config.tree.remove'] = previous
      } else {
        delete ctx.internal.actions['config.tree.remove']
      }
    }
  })
}

export default (ctx: Context) => {
  patchConfigRemoveLabel(ctx)
  patchConfigRemoveAction(ctx)

  ctx.slot({
    type: 'global',
    component: ConfigRemove,
  })

  ctx.slot({
    type: 'plugin-dependency',
    component: Dependency,
    disabled: () => !store.packages,
  })

  ctx.slot({
    type: 'plugin-details',
    component: Version,
    disabled: () => !store.packages,
    order: 1000,
  })

  ctx.slot({
    type: 'plugin-missing',
    component: Missing,
  })

  ctx.slot({
    type: 'plugin-select',
    component: Select,
  })
}

import { Component, defineComponent, h, onErrorCaptured, ref, resolveComponent, shallowRef } from 'vue'
import { translate } from '../i18n'

export function createPageBoundary(page: string, component: Component) {
  return defineComponent({
    name: `MarketNext${page}Boundary`,
    setup() {
      const error = shallowRef<unknown>()
      const revision = ref(0)
      const Empty = resolveComponent('k-empty')
      const Button = resolveComponent('el-button')

      onErrorCaptured((reason, _instance, info) => {
        error.value = reason
        console.error(`[market-next] ${page} page render failed (${info})`, reason)
        return false
      })

      const retry = () => {
        error.value = undefined
        revision.value++
      }

      return () => error.value
        ? h('div', { class: 'market-page-error' }, [
          h(Empty, null, {
            default: () => translate('common.messages.pageRenderFailed'),
          }),
          h(Button, { type: 'primary', onClick: retry }, {
            default: () => translate('common.actions.retry'),
          }),
        ])
        : h(component, { key: revision.value })
    },
  })
}

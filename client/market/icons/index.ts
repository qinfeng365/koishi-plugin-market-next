import { Component, defineComponent, h } from 'vue'

import misc from './misc'
import outline from './outline'
import solid from './solid'

const registry: Record<string, Component> = {
  ...misc,
  ...outline,
  ...solid,
}

export default defineComponent({
  inheritAttrs: false,
  props: {
    name: String,
  },
  setup(props, { attrs }) {
    return () => {
      const icon = props.name && registry[props.name]
      if (!icon) return null
      const { class: className, ...rest } = attrs
      return h(icon, {
        ...rest,
        class: ['market-icon', className],
        width: '1em',
        height: '1em',
        focusable: 'false',
        'aria-hidden': 'true',
      })
    }
  },
})

import type { Context } from '@koishijs/client'
import { setupClient } from './setup'
import Dependencies from './components/dependencies.vue'
import Market from './components/market.vue'

export default (ctx: Context) => setupClient(ctx, { Dependencies, Market })

import type { Context } from '@koishijs/client'
import { setupClient } from '../../setup'
import Dependencies from './dependencies.vue'
import Market from './market.vue'

export default (ctx: Context) => setupClient(ctx, { Dependencies, Market })

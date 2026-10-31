import type { Context } from '@koishijs/client'
import { setupClient } from '../../setup'
import Dependencies from './dependencies.vue'
import Market from './market.vue'
import Install from '../../components/install.vue'
import Confirm from '../../components/confirm.vue'
import InstallProgress from '../../components/install-progress.vue'

export default (ctx: Context) => setupClient(ctx, { Dependencies, Market, Install, Confirm, InstallProgress })

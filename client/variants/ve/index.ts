import type { Context } from '@koishijs/client'
import { setupClient } from '../../setup'
import Dependencies from './dependencies.vue'
import Market from './market.vue'
import Install from './install.vue'
import Confirm from './confirm.vue'
import InstallProgress from './install-progress.vue'
import './version-select.scss'
import './dialogs.scss'

export default (ctx: Context) => setupClient(ctx, { Dependencies, Market, Install, Confirm, InstallProgress })

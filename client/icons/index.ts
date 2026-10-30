import { icons } from '@koishijs/client'

import NavDeps from './activity/deps.vue'
import NavMarket from './activity/market.vue'

import Refresh from './market/refresh.vue'
import Rocket from './market/rocket.vue'
import Bomb from './market/bomb.vue'
import Upload from './market/upload.vue'

import MenuSwitch from './menu/switch.vue'
import MenuHistory from './menu/history.vue'
import MenuBellOff from './menu/bell-off.vue'
import MenuTrash from './menu/trash.vue'
import MenuCopy from './menu/copy.vue'
import MenuInbox from './menu/inbox.vue'
import MenuVersions from './menu/versions.vue'
import MenuSearchEmpty from './menu/search-empty.vue'

icons.register('activity:deps', NavDeps)
icons.register('activity:market', NavMarket)

icons.register('refresh', Refresh)
icons.register('rocket', Rocket)
icons.register('bomb', Bomb)
icons.register('market-next:upload', Upload)
icons.register('market-next:switch', MenuSwitch)
icons.register('market-next:history', MenuHistory)
icons.register('market-next:bell-off', MenuBellOff)
icons.register('market-next:trash', MenuTrash)
icons.register('market-next:copy', MenuCopy)
icons.register('market-next:inbox', MenuInbox)
icons.register('market-next:versions', MenuVersions)
icons.register('market-next:search-empty', MenuSearchEmpty)

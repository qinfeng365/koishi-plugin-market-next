import { isReactive, markRaw, toRaw, watch } from 'vue'
import { Context, global, store } from '@koishijs/client'
import { registerMarketNextI18n } from './i18n'
import { refreshMarketLookups, restoreMarketSnapshot } from './market/state'
import { setupPages } from './pages'
import { setupActions } from './actions'
import './icons'
import './styles/scrollbars.scss'
import './styles/version-select.scss'

import 'virtual:uno.css'

export default (ctx: Context) => {
  registerMarketNextI18n(ctx)

  if (global.devMode) {
    const registeredAt = performance.now()
    console.info('[market-next] console entry registered')
    ctx.effect(() => () => {
      console.info(`[market-next] console entry disposed after ${Math.round(performance.now() - registeredAt)}ms`)
    })
  }

  // Market indexes contain thousands of nested objects. Keep the index raw so
  // opening market-next does not turn the entire Console store into deep Vue proxies.
  ctx.effect(() => watch(() => store.market?.data, (data) => {
    if (!data || !isReactive(data)) return
    const raw = markRaw(toRaw(data))
    if (store.market) store.market.data = raw
  }, { immediate: true, flush: 'sync' }))

  ctx.effect(() => watch(() => store.market, () => {
    restoreMarketSnapshot()
  }, { immediate: true, flush: 'sync' }))

  ctx.effect(() => watch(() => store.market?.dataVersion, (version, previous) => {
    if (version == null || previous == null || version === previous) return
    void refreshMarketLookups().catch(error => {
      console.error('[market-next] failed to refresh market lookups', error)
    })
  }))

  setupPages(ctx)
  setupActions(ctx)
}

import { Context, Schema } from 'koishi'
import MarketProvider from './market'

export * from './market'
export * from '../shared'

export { MarketProvider }

export const filter = false
export const name = 'market'
export const inject = ['console']

export interface Config {
  uiVariant?: 'standard' | 've'
}

export const Config: Schema<Config> = Schema.object({
  uiVariant: Schema.union([
    Schema.const('standard'),
    Schema.const('ve'),
  ]).role('radio').default('standard'),
}).i18n({
  'zh-CN': require('./locales/schema.zh-CN'),
  'en-US': require('./locales/schema.en-US'),
})

export function apply(ctx: Context, config: Config) {
  const ui = config.uiVariant === 've' ? 've' : 'standard'
  ctx.plugin(MarketProvider)
  ctx.console.addListener('market/index', async () => {
    return ctx.console.services.market.getSnapshot()
  }, { authority: 4 })

  ctx.console.addEntry(process.env.KOISHI_BASE ? [
    process.env.KOISHI_BASE + `/dist/${ui}/index.js`,
    process.env.KOISHI_BASE + `/dist/${ui}/style.css`,
  ] : [
    // @ts-ignore
    import.meta.url.replace(/\/(?:src|lib)\/[^/]+\/[^/]+$/, ui === 've' ? '/client/variants/ve/index.ts' : '/client/index.ts'),
  ])
}

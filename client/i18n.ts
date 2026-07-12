import type { Context } from '@koishijs/client'
import { useI18n } from 'vue-i18n'
import zhCommon from './locales/zh-CN/common.yml'
import enCommon from './locales/en-US/common.yml'
import zhDependencies from './locales/zh-CN/dependencies.yml'
import enDependencies from './locales/en-US/dependencies.yml'
import zhMarketPage from './locales/zh-CN/market-page.yml'
import enMarketPage from './locales/en-US/market-page.yml'
import zhOperations from './locales/zh-CN/operations.yml'
import enOperations from './locales/en-US/operations.yml'
import zhDependencyCard from './locales/zh-CN/dependency-card.yml'
import enDependencyCard from './locales/en-US/dependency-card.yml'
import zhExtensions from './locales/zh-CN/extensions.yml'
import enExtensions from './locales/en-US/extensions.yml'
import zhBundle from './locales/zh-CN/bundle.yml'
import enBundle from './locales/en-US/bundle.yml'
import zhEnvironment from './locales/zh-CN/environment.yml'
import enEnvironment from './locales/en-US/environment.yml'
import zhMarket from './market/locales/zh-CN.yml'
import enMarket from './market/locales/en-US.yml'

const namespace = 'marketNext'
const localeMessages = {
  'zh-CN': {
    common: zhCommon,
    dependencies: zhDependencies,
    marketPage: zhMarketPage,
    operations: zhOperations,
    dependencyCard: zhDependencyCard,
    extensions: zhExtensions,
    bundle: zhBundle,
    environment: zhEnvironment,
    market: zhMarket,
  },
  'en-US': {
    common: enCommon,
    dependencies: enDependencies,
    marketPage: enMarketPage,
    operations: enOperations,
    dependencyCard: enDependencyCard,
    extensions: enExtensions,
    bundle: enBundle,
    environment: enEnvironment,
    market: enMarket,
  },
}

type Composer = ReturnType<typeof useI18n>['t']
let globalTranslate: Composer | undefined

export function registerMarketNextI18n(ctx: Context) {
  const composer = ctx.$i18n.i18n.global
  const previous: Record<string, unknown> = {}

  for (const [locale, messages] of Object.entries(localeMessages)) {
    const current = composer.getLocaleMessage(locale) as Record<string, unknown>
    previous[locale] = current[namespace]
    composer.mergeLocaleMessage(locale, { [namespace]: messages })
  }
  globalTranslate = composer.t

  ctx.effect(() => () => {
    for (const [locale, value] of Object.entries(previous)) {
      const current = { ...composer.getLocaleMessage(locale) as Record<string, unknown> }
      if (value === undefined) delete current[namespace]
      else current[namespace] = value
      composer.setLocaleMessage(locale, current)
    }
    globalTranslate = undefined
  })
}

export function useMarketNextI18n() {
  const { t: baseT, locale } = useI18n({ useScope: 'global' })
  const t = (key: string, ...args: any[]) => (baseT as any)(`${namespace}.${key}`, ...args)
  return { t, locale }
}

export function translate(key: string, ...args: any[]) {
  if (!globalTranslate) return key
  return (globalTranslate as any)(`${namespace}.${key}`, ...args)
}

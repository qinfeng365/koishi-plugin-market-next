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

interface GlobalComposer {
  t: Composer
  getLocaleMessage(locale: string): unknown
  mergeLocaleMessage(locale: string, messages: Record<string, unknown>): void
  setLocaleMessage(locale: string, messages: Record<string, unknown>): void
}

interface LocaleRegistrationState {
  references: number
  previous: Record<string, unknown>
}

const registrationRegistryKey = Symbol.for('koishi-plugin-market-next/i18n-registrations')
const registrationRegistry = ((globalThis as any)[registrationRegistryKey] ||= new WeakMap<object, LocaleRegistrationState>()) as WeakMap<object, LocaleRegistrationState>

let globalTranslate: Composer | undefined
let localRegistrations = 0

export function registerMarketNextI18n(ctx: Context) {
  const composer = ctx.$i18n.i18n.global as unknown as GlobalComposer
  let state = registrationRegistry.get(composer)

  if (!state) {
    const previous: Record<string, unknown> = {}
    for (const locale of Object.keys(localeMessages)) {
      const current = composer.getLocaleMessage(locale) as Record<string, unknown>
      previous[locale] = current[namespace]
    }
    state = { references: 0, previous }
    registrationRegistry.set(composer, state)
  }

  state.references++
  localRegistrations++
  for (const [locale, messages] of Object.entries(localeMessages)) {
    composer.mergeLocaleMessage(locale, { [namespace]: messages })
  }
  globalTranslate = composer.t as Composer

  ctx.effect(() => () => {
    localRegistrations = Math.max(0, localRegistrations - 1)
    if (!localRegistrations) globalTranslate = undefined

    state.references = Math.max(0, state.references - 1)
    if (state.references) return

    for (const [locale, value] of Object.entries(state.previous)) {
      const current = { ...composer.getLocaleMessage(locale) as Record<string, unknown> }
      if (value === undefined) delete current[namespace]
      else current[namespace] = value
      composer.setLocaleMessage(locale, current)
    }
    registrationRegistry.delete(composer)
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

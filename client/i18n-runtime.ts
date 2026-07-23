export interface LocaleMessageComposer {
  getLocaleMessage(locale: string): unknown
  mergeLocaleMessage(locale: string, messages: Record<string, unknown>): void
  setLocaleMessage(locale: string, messages: Record<string, unknown>): void
}

export type LocaleNamespaceMessages = Record<string, Record<string, unknown>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function hasCompleteLocaleMessage(actual: unknown, expected: unknown): boolean {
  if (!isRecord(expected)) return actual === expected
  if (!isRecord(actual)) return false
  return Object.entries(expected).every(([key, value]) => {
    return hasCompleteLocaleMessage(actual[key], value)
  })
}

export function ensureLocaleNamespace(
  composer: LocaleMessageComposer,
  namespace: string,
  messages: LocaleNamespaceMessages,
) {
  let changed = false
  for (const [locale, value] of Object.entries(messages)) {
    const current = composer.getLocaleMessage(locale)
    const namespaceMessages = isRecord(current) ? current[namespace] : undefined
    if (hasCompleteLocaleMessage(namespaceMessages, value)) continue
    composer.mergeLocaleMessage(locale, { [namespace]: value })
    changed = true
  }
  return changed
}

interface LocaleNamespaceGuard {
  applying: boolean
  ensure(): void
}

const guardRegistryKey = Symbol.for('koishi-plugin-market-next/i18n-namespace-guards')
const guardRegistry = ((globalThis as any)[guardRegistryKey] ||= new WeakMap<object, LocaleNamespaceGuard>()) as WeakMap<object, LocaleNamespaceGuard>

export function installLocaleNamespaceGuard(
  composer: LocaleMessageComposer,
  namespace: string,
  messages: LocaleNamespaceMessages,
) {
  let guard = guardRegistry.get(composer as object)
  if (!guard) {
    const setLocaleMessage = composer.setLocaleMessage.bind(composer)
    guard = {
      applying: false,
      ensure: () => {},
    }
    // Legacy bundles restore their locale snapshots through this method after
    // a newer entry can already be active, so the app-level guard must persist.
    composer.setLocaleMessage = (locale, value) => {
      setLocaleMessage(locale, value)
      if (!guard!.applying) guard!.ensure()
    }
    guardRegistry.set(composer as object, guard)
  }

  guard.ensure = () => {
    guard!.applying = true
    try {
      ensureLocaleNamespace(composer, namespace, messages)
    } finally {
      guard!.applying = false
    }
  }
  guard.ensure()
}

import { sv, type Messages } from './sv'
import { en } from './en'

export type Locale = 'sv' | 'en'
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K]
}

function merge<T extends object>(base: T, override: DeepPartial<T>): T {
  const out = { ...base }
  for (const key of Object.keys(override) as (keyof T)[]) {
    const value = override[key]
    if (value === undefined) continue
    out[key] = (typeof value === 'object' && value !== null ? merge(base[key] as object, value as object) : value) as T[keyof T]
  }
  return out
}

const locales: Record<Locale, Messages> = {
  sv,
  en: merge<Messages>(sv, en),
}

export const defaultLocale: Locale = 'sv'

export function getStrings(locale: Locale = defaultLocale): Messages {
  return locales[locale]
}

/** Strings for the current locale. Swedish until a locale switcher exists. */
export const strings = getStrings()

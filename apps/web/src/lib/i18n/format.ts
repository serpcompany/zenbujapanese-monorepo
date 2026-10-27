import { fill } from '@zenbu/dictionary-core/detail/text'
import type { Locale } from './config'

export { fill, templateParts } from '@zenbu/dictionary-core/detail/text'

export type Plural = { one?: string; few?: string; many?: string; other: string }

export function pluralOf(forms: Plural, count: number, locale: Locale): string {
  const category = new Intl.PluralRules(locale).select(count) as keyof Plural
  return forms[category] ?? forms.other
}

export function countOf(forms: Plural, count: number, locale: Locale): string {
  return fill(pluralOf(forms, count, locale), { count: formatNumber(count, locale) })
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value)
}

export function formatDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`)
  )
}

export function formatMoment(moment: string, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone }).format(new Date(moment))
}

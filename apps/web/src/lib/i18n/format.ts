import type { Locale } from './config'

export type Plural = { one?: string; few?: string; many?: string; other: string }

const placeholder = /\{(\w+)\}/g

export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(placeholder, (whole, name: string) =>
    name in values ? String(values[name]) : whole
  )
}

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

export function templateParts(template: string): { text: string; name?: string }[] {
  const parts: { text: string; name?: string }[] = []
  let last = 0
  for (const match of template.matchAll(placeholder)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ text: template.slice(last, index) })
    parts.push({ text: match[0], name: match[1] })
    last = index + match[0].length
  }
  if (last < template.length) parts.push({ text: template.slice(last) })
  return parts
}

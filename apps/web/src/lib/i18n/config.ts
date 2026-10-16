type Language = { code: string; ogLocale: string; name: string }

export const languages = [
  { code: 'en', ogLocale: 'en_US', name: 'English' },
  { code: 'ja', ogLocale: 'ja_JP', name: '日本語' }
] as const satisfies readonly Language[]

export type Locale = (typeof languages)[number]['code']

export const locales: readonly Locale[] = languages.map(language => language.code)

export const defaultLocale: Locale = languages[0].code

export const otherLocales: readonly Locale[] = locales.filter(locale => locale !== defaultLocale)

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

export function languageOf(locale: Locale): (typeof languages)[number] {
  const language = languages.find(candidate => candidate.code === locale)
  if (!language) throw new Error(`Unknown language: ${locale}`)
  return language
}

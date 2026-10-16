const languages = ['en', 'ja'] as const

export type Language = (typeof languages)[number]

const defaultLanguage: Language = 'en'

export const languageHeader = 'content-language'

export function languageOf(value: unknown): Language | null {
  return languages.find(language => language === value) ?? null
}

export function emailLanguage(requested: unknown, stored: unknown): Language {
  return languageOf(requested) ?? languageOf(stored) ?? defaultLanguage
}

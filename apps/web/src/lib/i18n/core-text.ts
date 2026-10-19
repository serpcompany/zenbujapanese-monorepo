import type { Locale } from './config'
import { japaneseCoreText } from './core-text-ja'

const translations: Record<Locale, ((text: string) => string | null) | null> = {
  en: null,
  ja: japaneseCoreText
}

export function coreText(text: string, locale: Locale): string {
  return translations[locale]?.(text) ?? text
}

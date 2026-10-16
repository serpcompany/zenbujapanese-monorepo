import type { Locale } from '@/lib/i18n/config'
import { sourceLang } from '@/lib/i18n/core-text'

export function SourceText({ text, locale }: { text: string; locale: Locale }) {
  const lang = sourceLang(locale)
  return lang ? <span lang={lang}>{text}</span> : text
}

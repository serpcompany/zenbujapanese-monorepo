import { type Locale, sourceLang } from '@/lib/i18n/config'

export function SourceText({ text, locale }: { text: string; locale: Locale }) {
  const lang = sourceLang(locale)
  return lang ? <span lang={lang}>{text}</span> : text
}

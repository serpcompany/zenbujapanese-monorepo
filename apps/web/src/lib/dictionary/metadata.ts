import type { Metadata } from 'next'
import { defaultLocale, type Locale, languageOf } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'
import { localizedAlternates } from '@/lib/seo'

export function dictionaryMetadata(
  encodedPath: string,
  locale: Locale,
  title: string,
  description: string,
  options: { index?: boolean } = {}
): Metadata {
  return {
    title,
    description,
    alternates: localizedAlternates(encodedPath, locale),
    openGraph: {
      title,
      description,
      url: localizedPath(encodedPath, locale),
      ...(locale === defaultLocale ? {} : { locale: languageOf(locale).ogLocale })
    },
    ...(options.index === false ? { robots: { index: false, follow: true } } : {})
  }
}

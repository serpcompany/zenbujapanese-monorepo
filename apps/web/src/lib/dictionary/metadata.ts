import type { Metadata } from 'next'
import type { Locale } from '@/lib/i18n/config'
import { sitePageMetadata } from '@/lib/metadata'

export function dictionaryMetadata(
  encodedPath: string,
  locale: Locale,
  title: string,
  description: string,
  options: { index?: boolean } = {}
): Metadata {
  return {
    ...sitePageMetadata({ path: encodedPath, title, description }, locale),
    ...(options.index === false ? { robots: { index: false, follow: true } } : {})
  }
}

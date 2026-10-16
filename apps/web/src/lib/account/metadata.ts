import type { Metadata } from 'next'
import type { Locale } from '@/lib/i18n/config'
import { localizedAlternates } from '@/lib/seo'
import { type AccountPage, accountPages } from './pages'

export function accountMetadata(page: AccountPage, locale: Locale): Metadata {
  const { path, title, description } = accountPages[page]
  return {
    title,
    description,
    alternates: localizedAlternates(path, locale),
    robots: { index: false, follow: false }
  }
}

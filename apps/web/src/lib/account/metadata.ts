import type { Metadata } from 'next'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedAlternates } from '@/lib/seo'
import { type AccountPage, accountPages } from './pages'

export function accountMetadata(page: AccountPage, locale: Locale): Metadata {
  const { title, description } = getDictionary(locale).account.pages[page]
  return {
    title,
    description,
    alternates: localizedAlternates(accountPages[page].path, locale),
    robots: { index: false, follow: false }
  }
}

import type { BrowseCategory } from '@zenbu/dictionary-core/browse/categories'
import { coreLanguage, type Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { japaneseCategoryNames, japaneseSubjects } from './category-names-ja'

const ownNames: Record<
  Exclude<Locale, typeof coreLanguage>,
  (slug: string) => { name: string; reading?: string } | undefined
> = {
  ja: slug => {
    const name = japaneseCategoryNames[slug]
    return name ? { name } : japaneseSubjects[slug]
  }
}

export function categoryName(category: BrowseCategory, locale: Locale): string {
  if (locale === coreLanguage) return category.name
  if (category.wordLabel) return coreText(category.wordLabel, locale)
  return ownNames[locale](category.slug)?.name ?? category.name
}

export function categorySortName(category: BrowseCategory, locale: Locale): string {
  if (locale === coreLanguage) return category.name
  return ownNames[locale](category.slug)?.reading ?? categoryName(category, locale)
}

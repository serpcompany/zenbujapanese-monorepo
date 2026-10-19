import { browseCategories, type CategoryKind } from '@zenbu/dictionary-core/browse/categories'
import type { Metadata } from 'next'
import {
  type CategoryGroup,
  CategoryIndexPage
} from '@/components/dictionary/browse/category-pages'
import { categorySortName } from '@/lib/dictionary/browse/category-names'
import { getCategoryCounts } from '@/lib/dictionary/browse/data'
import { type CategoryIndex, categoryIndexes } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import type { Locale } from '@/lib/i18n/config'
import { type Dictionary, getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'

type LocaleParams = { params: Promise<{ locale: string }> }

type GroupHeading = keyof Dictionary['browse']['categoryIndexes']['groups']

const groupsOf: Record<CategoryIndex, { kind: CategoryKind; heading?: GroupHeading }[]> = {
  partOfSpeech: [{ kind: 'partOfSpeech' }],
  usage: [
    { kind: 'usage', heading: 'usage' },
    { kind: 'dialect', heading: 'dialect' }
  ],
  subject: [{ kind: 'subject' }]
}

function groupsIn(
  index: CategoryIndex,
  counts: ReadonlyMap<string, number>,
  locale: Locale
): CategoryGroup[] {
  const headings = getDictionary(locale).browse.categoryIndexes.groups
  const collator = new Intl.Collator(locale)
  return groupsOf[index].map(group => {
    const ofKind = browseCategories.filter(category => category.kind === group.kind)
    const ordered =
      group.kind === 'subject'
        ? [...ofKind].sort((left, right) =>
            collator.compare(categorySortName(left, locale), categorySortName(right, locale))
          )
        : ofKind
    return {
      title: group.heading ? headings[group.heading] : null,
      categories: ordered.flatMap(category => {
        const count = counts.get(category.slug)
        return count ? [{ category, count }] : []
      })
    }
  })
}

export function categoryIndexRoute(index: CategoryIndex) {
  return {
    async generateMetadata({ params }: LocaleParams): Promise<Metadata> {
      const locale = await localeOf(params)
      const { title, intro } = getDictionary(locale).browse.categoryIndexes[index]
      return dictionaryMetadata(categoryIndexes[index].path, locale, title, intro)
    },
    async Page({ params }: LocaleParams) {
      const locale = await localeOf(params)
      const counts = new Map((await getCategoryCounts()).map(({ slug, count }) => [slug, count]))
      return (
        <CategoryIndexPage index={index} groups={groupsIn(index, counts, locale)} locale={locale} />
      )
    }
  }
}

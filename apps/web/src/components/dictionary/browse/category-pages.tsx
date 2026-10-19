import {
  type BrowseCategory,
  browseCategory,
  type CategoryOrder,
  categoryOrders
} from '@zenbu/dictionary-core/browse/categories'
import { sourceCredits } from '@zenbu/dictionary-core/sources/credits'
import Link from 'next/link'
import {
  BrowseHeading,
  BrowsePage,
  LinkTabs,
  Pagination
} from '@/components/dictionary/browse/browse-ui'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { WordList } from '@/components/dictionary/word-row'
import { categoryName } from '@/lib/dictionary/browse/category-names'
import {
  browseText,
  categoryHeading,
  categoryIntro,
  moreWaysToBrowse,
  orderName
} from '@/lib/dictionary/browse/copy'
import type { BrowseWordsPage } from '@/lib/dictionary/browse/data'
import {
  browsePath,
  type CategoryIndex,
  categoryIndexes,
  categoryIndexOf,
  categoryPath
} from '@/lib/dictionary/browse/paths'
import { pageSources } from '@/lib/dictionary/sources'
import type { Locale } from '@/lib/i18n/config'
import { fill, formatNumber } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'
import { joinedSentences } from '@/lib/snippets'

const indexCrumbs = (index: CategoryIndex, locale: Locale) => [
  { label: browseText(locale).names.browse, path: browsePath },
  { label: browseText(locale).categoryIndexes[index].name, path: categoryIndexes[index].path }
]

function MoreWaysToBrowse({ current, locale }: { current: string; locale: Locale }) {
  const shown = moreWaysToBrowse
    .filter(slug => slug !== current)
    .flatMap(slug => browseCategory(slug) ?? [])
  return (
    <section className="flex flex-col gap-3 border-t pt-5">
      <h2 className="font-semibold">{browseText(locale).category.moreWays}</h2>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {shown.map(category => (
          <li key={category.slug}>
            <Link
              href={localizedPath(categoryPath(category.slug), locale)}
              className="underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              {categoryName(category, locale)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function CategoryWords({
  category,
  words,
  order,
  page,
  locale
}: {
  category: BrowseCategory
  words: BrowseWordsPage
  order: CategoryOrder
  page: number
  locale: Locale
}) {
  const t = browseText(locale)
  const index = categoryIndexOf(category.kind)
  const pageOf =
    words.pages > 1
      ? fill(t.pageOf, {
          page: formatNumber(page, locale),
          pages: formatNumber(words.pages, locale)
        })
      : null
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        locale={locale}
        pages={[
          ...(index ? indexCrumbs(index, locale) : [{ label: t.names.browse, path: browsePath }]),
          { label: categoryName(category, locale), path: categoryPath(category.slug) }
        ]}
      />
      <BrowseHeading title={categoryHeading(category, locale)}>
        {joinedSentences([categoryIntro(category, words.total, order, locale), pageOf], locale)}
      </BrowseHeading>
      <LinkTabs
        label={t.category.orderLabel}
        locale={locale}
        tabs={categoryOrders.map(each => ({
          label: orderName(each, locale),
          href: categoryPath(category.slug, each),
          current: each === order
        }))}
      />
      <WordList words={words.words} section="words" locale={locale} />
      <Pagination
        page={page}
        pages={words.pages}
        pathFor={number => categoryPath(category.slug, order, number)}
        locale={locale}
      />
      <MoreWaysToBrowse current={category.slug} locale={locale} />
      <SourceCredits sources={pageSources.browse} locale={locale} />
    </BrowsePage>
  )
}

export interface CategoryGroup {
  title: string | null
  categories: { category: BrowseCategory; count: number }[]
}

export function CategoryIndexPage({
  index,
  groups,
  locale
}: {
  index: CategoryIndex
  groups: CategoryGroup[]
  locale: Locale
}) {
  const t = browseText(locale).categoryIndexes[index]
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs locale={locale} pages={indexCrumbs(index, locale)} />
      <BrowseHeading title={t.heading}>{t.intro}</BrowseHeading>
      {groups.map(group => (
        <section key={group.title ?? index} className="flex flex-col gap-3">
          {group.title ? <h2 className="text-xl font-semibold">{group.title}</h2> : null}
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.categories.map(({ category, count }) => (
              <li key={category.slug}>
                <Link
                  href={localizedPath(categoryPath(category.slug), locale)}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-lg border px-4 hover:bg-muted"
                >
                  <span>{categoryName(category, locale)}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {formatNumber(count, locale)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <SourceCredits sources={[sourceCredits.jmdict]} locale={locale} />
    </BrowsePage>
  )
}

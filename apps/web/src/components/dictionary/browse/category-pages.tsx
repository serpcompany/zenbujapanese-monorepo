import {
  type BrowseCategory,
  browseCategory,
  type CategoryOrder,
  categoryOrders
} from '@zenbu/dictionary-core/browse/categories'
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
import {
  categoryHeading,
  categoryIntro,
  formatCount,
  moreWaysToBrowse,
  orderNames
} from '@/lib/dictionary/browse/copy'
import type { BrowseWordsPage } from '@/lib/dictionary/browse/data'
import {
  browsePath,
  type CategoryIndex,
  categoryIndexes,
  categoryIndexOf,
  categoryPath
} from '@/lib/dictionary/browse/paths'
import { pageSources, sources } from '@/lib/dictionary/sources'

function MoreWaysToBrowse({ current }: { current: string }) {
  const shown = moreWaysToBrowse
    .filter(slug => slug !== current)
    .flatMap(slug => browseCategory(slug) ?? [])
  return (
    <section className="flex flex-col gap-3 border-t pt-5">
      <h2 className="font-semibold">More ways to browse</h2>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {shown.map(category => (
          <li key={category.slug}>
            <Link
              href={categoryPath(category.slug)}
              className="underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              {category.name}
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
  page
}: {
  category: BrowseCategory
  words: BrowseWordsPage
  order: CategoryOrder
  page: number
}) {
  const index = categoryIndexOf(category.kind)
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        pages={[
          { label: 'Browse', path: browsePath },
          ...(index
            ? [{ label: categoryIndexes[index].name, path: categoryIndexes[index].path }]
            : []),
          { label: category.name, path: categoryPath(category.slug) }
        ]}
      />
      <BrowseHeading title={categoryHeading(category)}>
        {categoryIntro(category, words.total, order)}
        {words.pages > 1 ? ` Page ${page} of ${words.pages}.` : ''}
      </BrowseHeading>
      <LinkTabs
        label="Order"
        tabs={categoryOrders.map(each => ({
          label: orderNames[each],
          href: categoryPath(category.slug, each),
          current: each === order
        }))}
      />
      <WordList words={words.words} section="words" />
      <Pagination
        page={page}
        pages={words.pages}
        pathFor={number => categoryPath(category.slug, order, number)}
      />
      <MoreWaysToBrowse current={category.slug} />
      <SourceCredits sources={pageSources.browse} />
    </BrowsePage>
  )
}

export function CategoryIndexPage({
  index,
  intro,
  groups
}: {
  index: CategoryIndex
  intro: string
  groups: { title: string | null; categories: { category: BrowseCategory; count: number }[] }[]
}) {
  return (
    <BrowsePage>
      <DictionaryBreadcrumbs
        pages={[
          { label: 'Browse', path: browsePath },
          { label: categoryIndexes[index].name, path: categoryIndexes[index].path }
        ]}
      />
      <BrowseHeading title={categoryIndexes[index].name}>{intro}</BrowseHeading>
      {groups.map(group => (
        <section key={group.title ?? index} className="flex flex-col gap-3">
          {group.title ? <h2 className="text-xl font-semibold">{group.title}</h2> : null}
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.categories.map(({ category, count }) => (
              <li key={category.slug}>
                <Link
                  href={categoryPath(category.slug)}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-lg border px-4 hover:bg-muted"
                >
                  <span>{category.name}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {formatCount(count)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <SourceCredits sources={[sources.jmdict]} />
    </BrowsePage>
  )
}

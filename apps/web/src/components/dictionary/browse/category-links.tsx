import { browseCategory } from '@zenbu/dictionary-core/browse/categories'
import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  Chip,
  Chips,
  MoreLink,
  Panel,
  PanelHeading
} from '@/components/dictionary/browse/browse-ui'
import { categoryName } from '@/lib/dictionary/browse/category-names'
import { browseText, featuredCategories } from '@/lib/dictionary/browse/copy'
import { type CategoryIndex, categoryIndexes, categoryPath } from '@/lib/dictionary/browse/paths'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'

const groups = Object.keys(featuredCategories) as CategoryIndex[]

const featured = (index: CategoryIndex, shown: number) =>
  featuredCategories[index].slice(0, shown).flatMap(slug => browseCategory(slug) ?? [])

type IndexText = ReturnType<typeof browseText>['categoryIndexes'][CategoryIndex]

function CategoryPanels({
  locale,
  className,
  children
}: {
  locale: Locale
  className?: string
  children: (index: CategoryIndex, text: IndexText) => ReactNode
}) {
  const t = browseText(locale).categoryIndexes
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {groups.map(index => (
        <Panel key={index} label={t[index].name} className={className}>
          {children(index, t[index])}
        </Panel>
      ))}
    </div>
  )
}

export function CategoryLinkLists({ locale }: { locale: Locale }) {
  return (
    <CategoryPanels locale={locale} className="gap-2">
      {(index, text) => (
        <>
          <h3 className="mb-1 font-semibold">{text.name}</h3>
          <ul className="flex flex-col gap-2">
            {featured(index, featuredCategories[index].length).map(category => (
              <li key={category.slug}>
                <Link
                  href={localizedPath(categoryPath(category.slug), locale)}
                  className="hover:underline"
                >
                  {categoryName(category, locale)}
                </Link>
              </li>
            ))}
          </ul>
          <MoreLink href={categoryIndexes[index].path} locale={locale}>
            {text.all}
          </MoreLink>
        </>
      )}
    </CategoryPanels>
  )
}

const chipsShown = 6

export function CategoryChipCards({ locale }: { locale: Locale }) {
  return (
    <CategoryPanels locale={locale}>
      {(index, text) => (
        <>
          <PanelHeading title={text.name} href={categoryIndexes[index].path} locale={locale} />
          <Chips label={text.name}>
            {featured(index, chipsShown).map(category => (
              <Chip key={category.slug} href={categoryPath(category.slug)} locale={locale}>
                {categoryName(category, locale)}
              </Chip>
            ))}
          </Chips>
        </>
      )}
    </CategoryPanels>
  )
}

import { browseCategory, type CategoryOrder } from '@zenbu/dictionary-core/browse/categories'
import { minimumIndexedWords } from '@zenbu/dictionary-core/browse/lists'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { CategoryWords } from '@/components/dictionary/browse/category-pages'
import {
  categoryCount,
  categoryDescription,
  categoryHeading,
  pagedTitle
} from '@/lib/dictionary/browse/copy'
import { getCategoryWords } from '@/lib/dictionary/browse/data'
import { categoryPath, pageNumber } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localeOf } from '@/lib/i18n/params'
import { localizedPath } from '@/lib/i18n/paths'
import { fittedDescription } from '@/lib/snippets'

type CategoryParams = { params: Promise<{ locale: string; category: string }> }
type PagedParams = { params: Promise<{ locale: string; category: string; page: string }> }

async function load(slug: string, order: CategoryOrder, page: number, locale: Locale) {
  const category = browseCategory(slug)
  const words = category ? await getCategoryWords(slug, order, page) : null
  if (!category || !words) notFound()
  return { category, words, order, page, locale }
}

type Loaded = Awaited<ReturnType<typeof load>>

function metadata({ category, words, order, page, locale }: Loaded): Metadata {
  const heading = categoryHeading(category, locale)
  const ordered =
    order === 'kana'
      ? fill(getDictionary(locale).browse.category.titleKana, { title: heading })
      : heading
  return dictionaryMetadata(
    categoryPath(category.slug, order, page),
    locale,
    pagedTitle(ordered, page, locale),
    fittedDescription(
      categoryCount(category, words.total, order, locale),
      [categoryDescription(category.slug, locale)],
      locale
    ),
    { index: order === 'used' && words.total >= minimumIndexedWords }
  )
}

async function paged(order: CategoryOrder, params: PagedParams['params']) {
  const locale = await localeOf(params)
  const { category, page: segment } = await params
  const number = pageNumber(segment)
  if (!number || !browseCategory(category)) notFound()
  if ('redirect' in number) permanentRedirect(localizedPath(categoryPath(category, order), locale))
  return load(category, order, number.page, locale)
}

async function first(order: CategoryOrder, params: CategoryParams['params']) {
  return load((await params).category, order, 1, await localeOf(params))
}

const page = (loaded: Loaded) => (
  <CategoryWords
    category={loaded.category}
    words={loaded.words}
    order={loaded.order}
    page={loaded.page}
    locale={loaded.locale}
  />
)

export function categoryRoute(order: CategoryOrder) {
  return {
    async generateMetadata({ params }: CategoryParams): Promise<Metadata> {
      return metadata(await first(order, params))
    },
    async Page({ params }: CategoryParams) {
      return page(await first(order, params))
    }
  }
}

export function categoryPagedRoute(order: CategoryOrder) {
  return {
    async generateMetadata({ params }: PagedParams): Promise<Metadata> {
      return metadata(await paged(order, params))
    },
    async Page({ params }: PagedParams) {
      return page(await paged(order, params))
    }
  }
}

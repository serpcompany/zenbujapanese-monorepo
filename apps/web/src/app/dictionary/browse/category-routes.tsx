import { browseCategory, type CategoryOrder } from '@zenbu/dictionary-core/browse/categories'
import { minimumIndexedWords } from '@zenbu/dictionary-core/browse/lists'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { CategoryWords } from '@/components/dictionary/browse/category-pages'
import { categoryHeading, categoryIntro, orderNames } from '@/lib/dictionary/browse/copy'
import { getCategoryWords } from '@/lib/dictionary/browse/data'
import { categoryPath, pageNumber } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

type CategoryParams = { params: Promise<{ category: string }> }
type PagedParams = { params: Promise<{ category: string; page: string }> }

async function load(slug: string, order: CategoryOrder, page: number) {
  const category = browseCategory(slug)
  const words = category ? await getCategoryWords(slug, order, page) : null
  if (!category || !words) notFound()
  return { category, words, order, page }
}

type Loaded = Awaited<ReturnType<typeof load>>

function metadata({ category, words, order, page }: Loaded): Metadata {
  const ordered = order === 'kana' ? `, ${orderNames.kana.toLowerCase()}` : ''
  const paged = page > 1 ? `, page ${page}` : ''
  return dictionaryMetadata(
    categoryPath(category.slug, order, page),
    `${categoryHeading(category)}${ordered}${paged}`,
    categoryIntro(category, words.total, order),
    { index: order === 'used' && words.total >= minimumIndexedWords }
  )
}

async function paged(order: CategoryOrder, params: PagedParams['params']) {
  const { category, page: segment } = await params
  const number = pageNumber(segment)
  if (!number || !browseCategory(category)) notFound()
  if ('redirect' in number) permanentRedirect(categoryPath(category, order))
  return load(category, order, number.page)
}

const page = (loaded: Loaded) => (
  <CategoryWords
    category={loaded.category}
    words={loaded.words}
    order={loaded.order}
    page={loaded.page}
  />
)

export function categoryRoute(order: CategoryOrder) {
  return {
    async generateMetadata({ params }: CategoryParams): Promise<Metadata> {
      return metadata(await load((await params).category, order, 1))
    },
    async Page({ params }: CategoryParams) {
      return page(await load((await params).category, order, 1))
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

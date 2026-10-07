import { browseCategory } from '@zenbu/dictionary-core/browse/categories'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { CategoryWords } from '@/components/dictionary/browse/category-pages'
import { categoryHeading, categoryIntro } from '@/lib/dictionary/browse/copy'
import { getCategoryWords } from '@/lib/dictionary/browse/data'
import { categoryPath, pageNumber } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

type CategoryParams = { params: Promise<{ category: string }> }
type PagedParams = { params: Promise<{ category: string; page: string }> }

async function load(slug: string, page: number) {
  const category = browseCategory(slug)
  const words = category ? await getCategoryWords(slug, page) : null
  if (!category || !words) notFound()
  return { category, words, page }
}

type Loaded = Awaited<ReturnType<typeof load>>

function metadata({ category, words, page }: Loaded): Metadata {
  const paged = page > 1 ? `, page ${page}` : ''
  return dictionaryMetadata(
    categoryPath(category.slug, page),
    `${categoryHeading(category)}${paged}`,
    categoryIntro(category, words.total)
  )
}

async function paged(params: PagedParams['params']) {
  const { category, page: segment } = await params
  const number = pageNumber(segment)
  if (!number || !browseCategory(category)) notFound()
  if ('redirect' in number) permanentRedirect(categoryPath(category))
  return load(category, number.page)
}

const page = (loaded: Loaded) => (
  <CategoryWords category={loaded.category} words={loaded.words} page={loaded.page} />
)

export const categoryRoute = {
  async generateMetadata({ params }: CategoryParams): Promise<Metadata> {
    return metadata(await load((await params).category, 1))
  },
  async Page({ params }: CategoryParams) {
    return page(await load((await params).category, 1))
  }
}

export const categoryPagedRoute = {
  async generateMetadata({ params }: PagedParams): Promise<Metadata> {
    return metadata(await paged(params))
  },
  async Page({ params }: PagedParams) {
    return page(await paged(params))
  }
}

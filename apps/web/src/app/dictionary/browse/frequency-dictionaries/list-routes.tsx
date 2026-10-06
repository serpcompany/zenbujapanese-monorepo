import { jlptList, rankedList } from '@zenbu/dictionary-core/browse/lists'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { RankedListPage } from '@/components/dictionary/browse/frequency-pages'
import { jlptCopy, rankedListCopy } from '@/lib/dictionary/browse/copy'
import { getRankedWords } from '@/lib/dictionary/browse/data'
import { pageNumber, rankedListPath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

type ListParams = { params: Promise<{ list: string }> }
type PagedParams = { params: Promise<{ list: string; page: string }> }

async function load(slug: string, page: number) {
  const ranked = rankedList(slug)
  const jlpt = jlptList(slug)
  const copy = ranked ? rankedListCopy[slug] : jlpt ? jlptCopy : undefined
  const words = copy ? await getRankedWords(slug, page) : null
  if (!copy || !words) notFound()
  return { slug, name: ranked?.name ?? jlpt?.name ?? slug, copy, words, page, ranked: !!ranked }
}

type Loaded = Awaited<ReturnType<typeof load>>

function metadata({ slug, name, copy, page, ranked }: Loaded): Metadata {
  const paged = page > 1 ? `, page ${page}` : ''
  return dictionaryMetadata(
    rankedListPath(slug, page),
    `${ranked ? `Most used Japanese words: ${name}` : `${name} vocabulary`}${paged}`,
    copy.description
  )
}

const view = (loaded: Loaded) => (
  <RankedListPage
    slug={loaded.slug}
    name={loaded.name}
    description={loaded.copy.description}
    sources={loaded.copy.sources}
    words={loaded.words}
    page={loaded.page}
    ranked={loaded.ranked}
  />
)

async function paged(params: PagedParams['params']) {
  const { list, page: segment } = await params
  const number = pageNumber(segment)
  if (!number || !(rankedList(list) || jlptList(list))) notFound()
  if ('redirect' in number) permanentRedirect(rankedListPath(list))
  return load(list, number.page)
}

export const listRoute = {
  async generateMetadata({ params }: ListParams): Promise<Metadata> {
    return metadata(await load((await params).list, 1))
  },
  async Page({ params }: ListParams) {
    return view(await load((await params).list, 1))
  }
}

export const pagedListRoute = {
  async generateMetadata({ params }: PagedParams): Promise<Metadata> {
    return metadata(await paged(params))
  },
  async Page({ params }: PagedParams) {
    return view(await paged(params))
  }
}

import { jlptLists, minimumIndexedWords, rankedList } from '@zenbu/dictionary-core/browse/lists'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { JlptListPage, RankBandPage } from '@/components/dictionary/browse/frequency-pages'
import { jlptCopy, rankBandHeading, rankedListCopy } from '@/lib/dictionary/browse/copy'
import { getRankedWords } from '@/lib/dictionary/browse/data'
import {
  jlptVocabularyPath,
  pageNumber,
  parseRankBand,
  rankBandPath
} from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

type BandParams = { params: Promise<{ list: string; band: string }> }
type LevelParams = { params: Promise<{ level: string }> }
type LevelPageParams = { params: Promise<{ level: string; page: string }> }

async function loadBand(params: BandParams['params']) {
  const { list: slug, band: segment } = await params
  const list = rankedList(slug)
  const band = parseRankBand(segment)
  const copy = rankedListCopy[slug]
  const words = list && band && copy ? await getRankedWords(slug, band) : null
  if (!list || !band || !copy || !words) notFound()
  return { list, band, copy, words }
}

export const rankBandRoute = {
  async generateMetadata({ params }: BandParams): Promise<Metadata> {
    const { list, band, copy, words } = await loadBand(params)
    return dictionaryMetadata(
      rankBandPath(list.slug, band),
      rankBandHeading(list.name, band),
      copy.description,
      { index: words.words.length >= minimumIndexedWords }
    )
  },
  async Page({ params }: BandParams) {
    const { list, band, copy, words } = await loadBand(params)
    return <RankBandPage list={list} band={band} copy={copy} words={words} />
  }
}

const jlptLevel = (segment: string) => jlptLists.find(list => `n${list.level}` === segment)

async function loadLevel(segment: string, page: number) {
  const level = jlptLevel(segment)
  const words = level ? await getRankedWords(level.slug, page) : null
  if (!level || !words) notFound()
  return { level, words, page }
}

type LoadedLevel = Awaited<ReturnType<typeof loadLevel>>

function levelMetadata({ level, words, page }: LoadedLevel): Metadata {
  const paged = page > 1 ? `, page ${page}` : ''
  return dictionaryMetadata(
    jlptVocabularyPath(level.level, page),
    `${level.name} vocabulary${paged}`,
    jlptCopy.description,
    { index: words.total >= minimumIndexedWords }
  )
}

const levelView = ({ level, words, page }: LoadedLevel) => (
  <JlptListPage level={level} words={words} page={page} />
)

async function pagedLevel(params: LevelPageParams['params']) {
  const { level: segment, page: pageSegment } = await params
  const level = jlptLevel(segment)
  const number = pageNumber(pageSegment)
  if (!level || !number) notFound()
  if ('redirect' in number) permanentRedirect(jlptVocabularyPath(level.level))
  return loadLevel(segment, number.page)
}

export const jlptRoute = {
  async generateMetadata({ params }: LevelParams): Promise<Metadata> {
    return levelMetadata(await loadLevel((await params).level, 1))
  },
  async Page({ params }: LevelParams) {
    return levelView(await loadLevel((await params).level, 1))
  }
}

export const pagedJlptRoute = {
  async generateMetadata({ params }: LevelPageParams): Promise<Metadata> {
    return levelMetadata(await pagedLevel(params))
  },
  async Page({ params }: LevelPageParams) {
    return levelView(await pagedLevel(params))
  }
}

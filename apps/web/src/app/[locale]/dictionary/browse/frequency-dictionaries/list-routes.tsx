import { minimumIndexedWords, rankedList } from '@zenbu/dictionary-core/browse/lists'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { JlptListPage, RankBandPage } from '@/components/dictionary/browse/frequency-pages'
import {
  counted,
  jlptCopy,
  joinSentences,
  pagedTitle,
  rankBandTitle,
  rankedListCopy,
  rankRange
} from '@/lib/dictionary/browse/copy'
import { getRankedWords } from '@/lib/dictionary/browse/data'
import {
  jlptVocabularyPath,
  pageNumber,
  parseJlptLevel,
  parseRankBand,
  rankBandPath
} from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import type { Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill, formatNumber } from '@/lib/i18n/format'
import { localeOf } from '@/lib/i18n/params'
import { localizedPath } from '@/lib/i18n/paths'

type BandParams = { params: Promise<{ locale: string; list: string; band: string }> }
type LevelParams = { params: Promise<{ locale: string; level: string }> }
type LevelPageParams = { params: Promise<{ locale: string; level: string; page: string }> }

const frequencyText = (locale: Locale) => getDictionary(locale).browse.frequency

async function loadBand(params: BandParams['params']) {
  const locale = await localeOf(params)
  const { list: slug, band: segment } = await params
  const list = rankedList(slug)
  const band = parseRankBand(segment)
  const copy = rankedListCopy(slug, locale)
  const words = list && band && copy ? await getRankedWords(slug, band) : null
  if (!list || !band || !copy || !words) notFound()
  return { list, band, copy, words, locale }
}

export const rankBandRoute = {
  async generateMetadata({ params }: BandParams): Promise<Metadata> {
    const { list, band, copy, words, locale } = await loadBand(params)
    const range = rankRange(band, locale)
    return dictionaryMetadata(
      rankBandPath(list.slug, band),
      locale,
      rankBandTitle(coreText(list.name, locale), band, locale),
      joinSentences([copy.description, fill(frequencyText(locale).bandRanks, { range })], locale),
      { index: words.words.length >= minimumIndexedWords }
    )
  },
  async Page({ params }: BandParams) {
    const { list, band, copy, words, locale } = await loadBand(params)
    return <RankBandPage list={list} band={band} copy={copy} words={words} locale={locale} />
  }
}

async function loadLevel(segment: string, page: number, locale: Locale) {
  const level = parseJlptLevel(segment)
  const words = level ? await getRankedWords(level.slug, page) : null
  if (!level || !words) notFound()
  return { level, words, page, locale }
}

type LoadedLevel = Awaited<ReturnType<typeof loadLevel>>

function levelMetadata({ level, words, page, locale }: LoadedLevel): Metadata {
  const t = frequencyText(locale)
  const described = counted(page > 1 ? t.jlptMetaPaged : t.jlptMeta, words.total, locale, {
    name: level.name,
    page: formatNumber(page, locale)
  })
  return dictionaryMetadata(
    jlptVocabularyPath(level.level, page),
    locale,
    pagedTitle(fill(t.jlptHeading, { name: level.name }), page, locale),
    joinSentences([described, jlptCopy(locale).description], locale),
    { index: words.total >= minimumIndexedWords }
  )
}

const levelView = ({ level, words, page, locale }: LoadedLevel) => (
  <JlptListPage level={level} words={words} page={page} locale={locale} />
)

async function pagedLevel(params: LevelPageParams['params']) {
  const locale = await localeOf(params)
  const { level: segment, page: pageSegment } = await params
  const level = parseJlptLevel(segment)
  const number = pageNumber(pageSegment)
  if (!level || !number) notFound()
  if ('redirect' in number)
    permanentRedirect(localizedPath(jlptVocabularyPath(level.level), locale))
  return loadLevel(segment, number.page, locale)
}

async function firstLevel(params: LevelParams['params']) {
  return loadLevel((await params).level, 1, await localeOf(params))
}

export const jlptRoute = {
  async generateMetadata({ params }: LevelParams): Promise<Metadata> {
    return levelMetadata(await firstLevel(params))
  },
  async Page({ params }: LevelParams) {
    return levelView(await firstLevel(params))
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

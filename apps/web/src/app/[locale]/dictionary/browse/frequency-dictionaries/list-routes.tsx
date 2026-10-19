import { minimumIndexedWords, rankedList } from '@zenbu/dictionary-core/browse/lists'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { JlptListPage, RankBandPage } from '@/components/dictionary/browse/frequency-pages'
import {
  counted,
  jlptCopy,
  pagedTitle,
  rankBandTitle,
  rankedListCopy,
  rankRange
} from '@/lib/dictionary/browse/copy'
import { getRankBandWords, getRankedWords } from '@/lib/dictionary/browse/data'
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
import { fittedDescription, joinedSentences } from '@/lib/snippets'

type BandParams = Promise<{ locale: string; list: string; band: string }>
type BandPageParams = Promise<{ locale: string; list: string; band: string; page: string }>
type LevelParams = Promise<{ locale: string; level: string }>
type LevelPageParams = Promise<{ locale: string; level: string; page: string }>

const frequencyText = (locale: Locale) => getDictionary(locale).browse.frequency

function listRoute<Params, Loaded>(
  load: (params: Params) => Promise<Loaded>,
  metadata: (loaded: Loaded) => Metadata,
  view: (loaded: Loaded) => ReactNode
) {
  return {
    async generateMetadata({ params }: { params: Params }): Promise<Metadata> {
      return metadata(await load(params))
    },
    async Page({ params }: { params: Params }) {
      return view(await load(params))
    }
  }
}

async function loadBand(slug: string, segment: string, page: number, locale: Locale) {
  const list = rankedList(slug)
  const band = parseRankBand(segment)
  const copy = rankedListCopy(slug, locale)
  const words = list && band && copy ? await getRankBandWords(slug, band, page) : null
  if (!list || !band || !copy || !words) notFound()
  return { list, band, page, copy, words, locale }
}

type LoadedBand = Awaited<ReturnType<typeof loadBand>>

function bandMetadata({ list, band, page, copy, words, locale }: LoadedBand): Metadata {
  const { ranks } = words
  const range = rankRange(ranks, locale)
  return dictionaryMetadata(
    rankBandPath(list.slug, band, page),
    locale,
    rankBandTitle(coreText(list.name, locale), ranks, locale),
    fittedDescription(
      joinedSentences([copy.description, fill(frequencyText(locale).bandRanks, { range })], locale),
      [frequencyText(locale).bandMetaMore],
      locale
    ),
    { index: words.total >= minimumIndexedWords }
  )
}

const bandView = (loaded: LoadedBand) => <RankBandPage {...loaded} />

async function firstBand(params: BandParams) {
  const { list, band } = await params
  return loadBand(list, band, 1, await localeOf(params))
}

async function pagedBand(params: BandPageParams) {
  const locale = await localeOf(params)
  const { list, band: segment, page: pageSegment } = await params
  const band = parseRankBand(segment)
  const number = pageNumber(pageSegment)
  if (!rankedList(list) || !band || !number) notFound()
  if ('redirect' in number) permanentRedirect(localizedPath(rankBandPath(list, band), locale))
  return loadBand(list, segment, number.page, locale)
}

export const rankBandRoute = listRoute(firstBand, bandMetadata, bandView)

export const pagedRankBandRoute = listRoute(pagedBand, bandMetadata, bandView)

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
    fittedDescription(described, [[jlptCopy(locale).description, t.jlptMetaMore]], locale),
    { index: words.total >= minimumIndexedWords }
  )
}

const levelView = ({ level, words, page, locale }: LoadedLevel) => (
  <JlptListPage level={level} words={words} page={page} locale={locale} />
)

async function pagedLevel(params: LevelPageParams) {
  const locale = await localeOf(params)
  const { level: segment, page: pageSegment } = await params
  const level = parseJlptLevel(segment)
  const number = pageNumber(pageSegment)
  if (!level || !number) notFound()
  if ('redirect' in number)
    permanentRedirect(localizedPath(jlptVocabularyPath(level.level), locale))
  return loadLevel(segment, number.page, locale)
}

async function firstLevel(params: LevelParams) {
  return loadLevel((await params).level, 1, await localeOf(params))
}

export const jlptRoute = listRoute(firstLevel, levelMetadata, levelView)

export const pagedJlptRoute = listRoute(pagedLevel, levelMetadata, levelView)

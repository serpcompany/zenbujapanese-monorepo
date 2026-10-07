import type { CategoryOrder } from '@zenbu/dictionary-core/artifact/browse'
import type { CategoryKind } from '@zenbu/dictionary-core/browse/categories'
import type { KanaScript } from '@zenbu/dictionary-core/browse/kana'
import { allRankBands, maximumBrowsePage, rankBand } from '@zenbu/dictionary-core/browse/lists'

export const browsePath = '/dictionary/browse/'
export const kanaChartsPath = `${browsePath}kana/`
export const kanjiListsPath = `${browsePath}kanji/`
export const frequencyDictionariesPath = `${browsePath}frequency-dictionaries/`

export const categoryIndexes = {
  partOfSpeech: { path: `${browsePath}parts-of-speech/`, name: 'Parts of speech' },
  usage: { path: `${browsePath}usage/`, name: 'Usage labels' },
  subject: { path: `${browsePath}subjects/`, name: 'Subjects' }
} as const

export type CategoryIndex = keyof typeof categoryIndexes

export const categoryIndexOf = (kind: CategoryKind): CategoryIndex | null =>
  kind === 'common' ? null : kind === 'dialect' ? 'usage' : kind

const withPage = (path: string, page: number) => (page > 1 ? `${path}${page}/` : path)

export const scriptPath = (script: KanaScript) => `${browsePath}${script}/`

export const kanaPath = (script: KanaScript, kana: string, page = 1) =>
  withPage(`${scriptPath(script)}${encodeURIComponent(kana)}/`, page)

export const categoryPath = (slug: string, order: CategoryOrder = 'used', page = 1) =>
  withPage(`${browsePath}${slug}/${order === 'kana' ? 'kana-order/' : ''}`, page)

const bandSegment = (band: number) => {
  const { first, last } = rankBand(band)
  return `${first}-${last}`
}

export const rankBandPath = (slug: string, band: number) =>
  `${frequencyDictionariesPath}${slug}/${bandSegment(band)}/`

export const rankedListPath = (slug: string) => rankBandPath(slug, 1)

export function parseRankBand(segment: string): number | null {
  return allRankBands.find(({ band }) => bandSegment(band) === segment)?.band ?? null
}

export const jlptVocabularyPath = (level: number, page = 1) =>
  withPage(`${frequencyDictionariesPath}jlpt/n${level}/`, page)

export const kanjiListPath = (slug: string) => `${kanjiListsPath}${slug}/`

export const strokeCountsAnchor = 'by-stroke-count'

export const strokeCountsPath = `${kanjiListsPath}#${strokeCountsAnchor}`

export type PageNumber = { page: number } | { redirect: true } | null

export function pageNumber(segment: string): PageNumber {
  if (!/^[1-9]\d*$/u.test(segment) || Number(segment) > maximumBrowsePage) return null
  const page = Number(segment)
  return page === 1 ? { redirect: true } : { page }
}

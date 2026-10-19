import {
  browsePageSize,
  type RankBand,
  rankBand,
  rankBandSize
} from '@zenbu/dictionary-core/browse/lists'

export type Ranks = Pick<RankBand, 'first' | 'last'>

export const rankPagesPerBand = rankBandSize / browsePageSize

export function rankPageRanks(band: number, page: number): Ranks {
  const first = rankBand(band).first + (page - 1) * browsePageSize
  return { first, last: first + browsePageSize - 1 }
}

export function rankBandPage<Word extends { rank: number | null }>(
  words: readonly Word[],
  band: number,
  page: number
): { words: Word[]; pages: number } | null {
  const { first } = rankBand(band)
  const pageOf = ({ rank }: Word) => Math.floor(((rank ?? first) - first) / browsePageSize) + 1
  const pages = words.reduce((last, word) => Math.max(last, pageOf(word)), 1)
  if (page < 1 || page > pages) return null
  return { words: words.filter(word => pageOf(word) === page), pages }
}

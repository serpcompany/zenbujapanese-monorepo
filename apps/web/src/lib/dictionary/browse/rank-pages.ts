import {
  browsePageSize,
  pageCount,
  type RankBand,
  rankBand
} from '@zenbu/dictionary-core/browse/lists'

export type Ranks = Pick<RankBand, 'first' | 'last'>

export interface RankBandPage<Word> {
  words: Word[]
  pages: number
  total: number
  ranks: Ranks
}

export function rankBandPage<Word extends { rank: number | null }>(
  words: readonly Word[],
  band: number,
  page: number
): RankBandPage<Word> | null {
  const pages = pageCount(words.length)
  if (page < 1 || page > pages) return null
  const shown = words.slice((page - 1) * browsePageSize, page * browsePageSize)
  const { first, last } = rankBand(band)
  return {
    words: shown,
    pages,
    total: words.length,
    ranks: {
      first: page === 1 ? first : (shown[0]?.rank ?? first),
      last: page === pages ? last : (shown.at(-1)?.rank ?? last)
    }
  }
}

import { describe, expect, test } from 'vitest'
import { rankBandPage, rankPageRanks, rankPagesPerBand } from './rank-pages'

const ranked = (...ranks: number[]) => ranks.map(rank => ({ rank }))
const ranksOf = (words: readonly { rank: number | null }[] | undefined) =>
  words?.map(word => word.rank)

describe('a band’s pages', () => {
  test('a band of 1,000 ranks is five pages of 200 ranks each', () => {
    expect(rankPagesPerBand).toBe(5)
    expect(rankPageRanks(1, 1)).toEqual({ first: 1, last: 200 })
    expect(rankPageRanks(2, 1)).toEqual({ first: 1_001, last: 1_200 })
    expect(rankPageRanks(2, 2)).toEqual({ first: 1_201, last: 1_400 })
    expect(rankPageRanks(10, 5)).toEqual({ first: 9_801, last: 10_000 })
  })

  test('each page shows the words ranked in its 200 ranks, and the band ends at its last ranked word', () => {
    const band = ranked(1_001, 1_200, 1_201, 1_400, 1_401, 1_750)
    expect(ranksOf(rankBandPage(band, 2, 1)?.words)).toEqual([1_001, 1_200])
    expect(ranksOf(rankBandPage(band, 2, 2)?.words)).toEqual([1_201, 1_400])
    expect(ranksOf(rankBandPage(band, 2, 3)?.words)).toEqual([1_401])
    expect(ranksOf(rankBandPage(band, 2, 4)?.words)).toEqual([1_750])
    expect(rankBandPage(band, 2, 1)?.pages).toBe(4)
    expect(rankBandPage(band, 2, 5)).toBeNull()
    expect(rankBandPage(band, 2, 0)).toBeNull()
  })

  test('a full band has all five pages, and a page between ranked words may be empty', () => {
    const band = ranked(1, 650, 1_000)
    expect(rankBandPage(band, 1, 2)).toEqual({ words: [], pages: 5 })
    expect(ranksOf(rankBandPage(band, 1, 5)?.words)).toEqual([1_000])
    expect(rankBandPage(band, 1, 6)).toBeNull()
  })

  test('a band that ranks no word past its first 200 ranks, as on the fixtures, is one page', () => {
    expect(rankBandPage(ranked(5, 20, 65), 1, 1)?.pages).toBe(1)
    expect(rankBandPage(ranked(5, 20, 65), 1, 2)).toBeNull()
    expect(rankBandPage([], 3, 1)).toEqual({ words: [], pages: 1 })
  })
})

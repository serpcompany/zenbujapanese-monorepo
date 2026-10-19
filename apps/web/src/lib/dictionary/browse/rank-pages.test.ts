import { describe, expect, test } from 'vitest'
import { rankBandPage } from './rank-pages'

const ranked = (...ranks: number[]) => ranks.map(rank => ({ rank }))
const band = (first: number, count: number, step = 1) =>
  ranked(...Array.from({ length: count }, (_, index) => first + index * step))
const ranksOf = (words: readonly { rank: number | null }[] | undefined) =>
  words?.map(word => word.rank)

describe('a band’s pages', () => {
  test('a band shows its words 200 to a page, as the other lists do', () => {
    const words = band(1_001, 450, 2)
    expect(rankBandPage(words, 2, 1)?.words).toHaveLength(200)
    expect(rankBandPage(words, 2, 2)?.words).toHaveLength(200)
    expect(ranksOf(rankBandPage(words, 2, 3)?.words)).toHaveLength(50)
    expect(rankBandPage(words, 2, 1)).toMatchObject({ pages: 3, total: 450 })
  })

  test('the first page starts at the band’s first rank and the last ends at its last, the pages between at their words', () => {
    const words = band(1_003, 450, 2)
    expect(rankBandPage(words, 2, 1)?.ranks).toEqual({ first: 1_001, last: 1_401 })
    expect(rankBandPage(words, 2, 2)?.ranks).toEqual({ first: 1_403, last: 1_801 })
    expect(rankBandPage(words, 2, 3)?.ranks).toEqual({ first: 1_803, last: 2_000 })
  })

  test('there is no page before the first or past the last, so every page a sitemap lists exists', () => {
    const words = band(1, 401)
    expect(rankBandPage(words, 1, 3)?.words).toHaveLength(1)
    expect(rankBandPage(words, 1, 4)).toBeNull()
    expect(rankBandPage(words, 1, 0)).toBeNull()
  })

  test('a band of 200 words or fewer, as on the fixtures, is one page named for the whole band', () => {
    expect(rankBandPage(ranked(5, 20, 65), 1, 1)).toMatchObject({
      pages: 1,
      ranks: { first: 1, last: 1_000 }
    })
    expect(rankBandPage(ranked(5, 20, 65), 1, 2)).toBeNull()
    expect(rankBandPage([], 3, 1)).toEqual({
      words: [],
      pages: 1,
      total: 0,
      ranks: { first: 2_001, last: 3_000 }
    })
  })
})

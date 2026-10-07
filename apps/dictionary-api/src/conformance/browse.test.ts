import type { BrowseWord, DictionaryBrowse } from '@zenbu/dictionary-core/artifact/browse'
import { browseCategories } from '@zenbu/dictionary-core/browse/categories'
import {
  browsePageSize,
  pageCount,
  rankBand,
  rankBands,
  rankedLists
} from '@zenbu/dictionary-core/browse/lists'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, artifactDatabase, browse } from './support'

const sitemapUrlLimit = 50_000

const readings = (words: readonly BrowseWord[]) => words.map(word => word.reading)
const isSorted = (values: readonly string[]) =>
  values.every((value, index) => index === 0 || values[index - 1] <= value)

describe.runIf(artifactAvailable)('browsing the dictionary on the app’s data', () => {
  let service: DictionaryBrowse

  beforeAll(async () => {
    service = await browse()
  })

  test('hiragana and katakana together hold every entry', () => {
    const summary = service.summary()
    expect(summary.scripts.hiragana + summary.scripts.katakana).toBe(summary.entries)
    expect(service.kanaIndex('hiragana').initials.map(({ kana }) => kana)).toContain('か')
  })

  test('a kana’s two-kana groups and its own words add up to its count', () => {
    const initial = service.kanaInitial('hiragana', 'か')
    expect(initial).not.toBeNull()
    if (!initial) return
    const grouped = initial.prefixes.reduce((sum, { count }) => sum + count, 0)
    expect(grouped + initial.words.length).toBe(initial.total)
    expect(initial.previous).toBe('お')
    expect(initial.next).toBe('が')
    expect(readings(initial.words).every(reading => reading === 'か')).toBe(true)
  })

  test('a two-kana group lists its words in kana order, a page at a time', () => {
    const first = service.kanaWords('hiragana', 'こう', 1)
    const second = service.kanaWords('hiragana', 'こう', 2)
    expect(first?.words).toHaveLength(browsePageSize)
    expect(first?.pages).toBe(Math.ceil((first?.total ?? 0) / browsePageSize))
    const listed = readings([...(first?.words ?? []), ...(second?.words ?? [])])
    expect(listed.every(reading => reading.startsWith('こう'))).toBe(true)
    expect(isSorted(listed)).toBe(true)
    expect(service.kanaWords('katakana', 'こう', 1)).toBeNull()
    expect(service.kanaWords('hiragana', 'こう', (first?.pages ?? 0) + 1)).toBeNull()
  })

  test('every category the core names has words, so no category page is empty', () => {
    const counted = service.categoryCounts().categories
    expect(counted.map(({ slug }) => slug)).toEqual(browseCategories.map(({ slug }) => slug))
    expect(counted.every(({ count }) => count > 0)).toBe(true)
  })

  test.each(
    rankedLists.map(list => list.slug)
  )('the %s list ranks words from 1, a band of 1,000 ranks at a time', slug => {
    for (const band of [1, 2]) {
      const page = service.rankedWords(slug, band)
      expect(page?.pages).toBe(rankBands)
      const ranks = (page?.words ?? []).map(word => word.rank ?? 0)
      const { first, last } = rankBand(band)
      expect(ranks.length).toBeGreaterThan(browsePageSize)
      expect(ranks.every(rank => rank >= first && rank <= last)).toBe(true)
      expect(ranks).toEqual([...ranks].sort((left, right) => left - right))
    }
    expect(service.rankedWords(slug, rankBands + 1)).toBeNull()
  })

  test('the JLPT lists hold Waller’s words by level, in kana order', () => {
    const { jlpt } = service.rankedLists()
    expect(jlpt.map(list => list.slug)).toEqual([
      'jlpt-n5',
      'jlpt-n4',
      'jlpt-n3',
      'jlpt-n2',
      'jlpt-n1'
    ])
    const n5 = service.rankedWords('jlpt-n5', 1)
    expect(n5?.total).toBe(jlpt[0].count)
    expect(isSorted(readings(n5?.words ?? []))).toBe(true)
  })

  test('the kanji lists follow KANJIDIC2’s grades, most frequent first', () => {
    const hub = service.kanjiHub()
    const sizes = Object.fromEntries(hub.lists.map(list => [list.slug, list.characters.length]))
    expect(sizes).toMatchObject({ 'grade-1': 80, 'grade-2': 160, 'secondary-school': 1110 })
    expect(hub.lists.find(list => list.slug === 'grade-1')?.characters[0]).toBe('日')
    expect(hub.strokes.reduce((sum, { count }) => sum + count, 0)).toBe(
      service.summary().kanji.joyo
    )
    expect(service.kanjiList('strokes-1')?.kanji.map(kanji => kanji.character)).toEqual([
      '一',
      '乙'
    ])
  })

  test('every kanji a list shows has a meaning, a compatibility kanji its base kanji’s', () => {
    for (const { slug } of service.sitemap().kanjiLists) {
      const empty = (service.kanjiList(slug)?.kanji ?? []).filter(kanji => !kanji.meaning)
      expect(empty, slug).toEqual([])
    }
    const jinmeiyo = service.kanjiList('jinmeiyo')?.kanji ?? []
    expect(jinmeiyo.find(kanji => kanji.character === '\u{FA45}')?.meaning).toBe('sea')
  })

  test('the JLPT kanji lists are Waller’s, most frequent first', () => {
    const { jlpt } = service.kanjiHub()
    expect(jlpt.map(({ slug, count }) => [slug, count])).toEqual([
      ['jlpt-n5', 79],
      ['jlpt-n4', 166],
      ['jlpt-n3', 367],
      ['jlpt-n2', 367],
      ['jlpt-n1', 1232]
    ])
    const n5 = service.kanjiList('jlpt-n5')?.kanji.map(kanji => kanji.character) ?? []
    expect(n5.slice(0, jlpt[0].first.length)).toEqual(jlpt[0].first)
    expect(n5[0]).toBe('日')
    expect(service.sitemap().kanjiLists).toContainEqual({ slug: 'jlpt-n1', count: 1232 })
  })

  test('once warm, the totals, the sitemap, and every list are ready, and every query a page asks has run', async () => {
    const queries: string[] = []
    const warmed = await browse(sql => queries.push(sql))
    warmed.warm()
    const prepared = new Set(queries)
    queries.length = 0
    warmed.summary()
    warmed.sitemap()
    warmed.categoryCounts()
    warmed.kanaIndex('katakana')
    warmed.rankedLists()
    warmed.kanjiHub()
    warmed.kanjiList('jinmeiyo')
    warmed.kanjiList('strokes-12')
    expect(queries).toEqual([])
    warmed.kanaInitial('hiragana', 'か')
    warmed.kanaWords('hiragana', 'かが', 1)
    warmed.categoryWords('nouns', 'used', 3)
    warmed.categoryWords('slang', 'kana', 2)
    warmed.rankedWords('wikipedia', 4)
    warmed.rankedWords('jlpt-n1', 2)
    expect(queries.length).toBeGreaterThan(0)
    expect(queries.filter(sql => !prepared.has(sql))).toEqual([])
  })

  test('the index lists a two-kana group as its own query would', async () => {
    const db = await artifactDatabase()
    const kaga = db
      .all<{ ent_seq: number }>(
        `SELECT e.source_record_id AS ent_seq FROM entries e WHERE substr(e.reading, 1, 2) = ?
         ORDER BY e.reading, e.source_record_id`,
        ['かが']
      )
      .map(row => row.ent_seq)
    const listed = (service.kanaWords('hiragana', 'かが', 1)?.words ?? []).map(word => word.entSeq)
    expect(listed).toEqual(kaga.slice(0, browsePageSize))
  })

  test('the browse sitemap fits in one file', () => {
    const sitemap = service.sitemap()
    const kanaPages = sitemap.kana.reduce(
      (sum, { prefixes }) =>
        sum + 1 + prefixes.reduce((pages, prefix) => pages + pageCount(prefix.count), 0),
      0
    )
    const listPages = [...sitemap.categories, ...sitemap.jlptLists].reduce(
      (sum, { count }) => sum + pageCount(count),
      0
    )
    const bandPages = sitemap.rankedLists.reduce((sum, { bands }) => sum + bands.length, 0)
    expect(kanaPages + listPages + bandPages + sitemap.kanjiLists.length).toBeLessThan(
      sitemapUrlLimit
    )
  })
})

import type { BrowseWord, DictionaryBrowse } from '@zenbu/dictionary-core/artifact/browse'
import { browseCategories } from '@zenbu/dictionary-core/browse/categories'
import { browsePageSize, rankedLists, rankedPages } from '@zenbu/dictionary-core/browse/lists'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, browse } from './support'

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

  test('a category lists the words JMdict labels with it, most used first', () => {
    const words = service.categoryWords('onomatopoeia', 'used', 1)?.words ?? []
    expect(words.map(word => word.headword)).toContain('わくわく')
    const ranks = words.flatMap(word =>
      word.chips.flatMap(chip =>
        chip.source === 'YouTube' && chip.value !== '—'
          ? [Number(chip.value.replaceAll(',', ''))]
          : []
      )
    )
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right))
    const kana = service.categoryWords('onomatopoeia', 'kana', 1)?.words ?? []
    expect(isSorted(readings(kana))).toBe(true)
  })

  test('every category the core names has words, so no category page is empty', () => {
    const counted = service.categoryCounts().categories
    expect(counted.map(({ slug }) => slug)).toEqual(browseCategories.map(({ slug }) => slug))
    expect(counted.every(({ count }) => count > 0)).toBe(true)
  })

  test.each(rankedLists.map(list => list.slug))('the %s list ranks words from 1', slug => {
    const page = service.rankedWords(slug, 1)
    expect(page?.pages).toBe(rankedPages)
    const ranks = (page?.words ?? []).map(word => word.rank ?? 0)
    expect(ranks.length).toBeGreaterThan(0)
    expect(ranks.every(rank => rank >= 1 && rank <= browsePageSize)).toBe(true)
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right))
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

  test('the browse sitemap fits in one file', () => {
    const sitemap = service.sitemap()
    const kanaPages = sitemap.kana.reduce(
      (sum, { prefixes }) => sum + 1 + prefixes.reduce((pages, prefix) => pages + prefix.pages, 0),
      0
    )
    const listPages = [...sitemap.categories, ...sitemap.rankedLists].reduce(
      (sum, { pages }) => sum + pages * 2,
      0
    )
    expect(kanaPages + listPages + sitemap.kanjiLists.length).toBeLessThan(sitemapUrlLimit)
  })
})

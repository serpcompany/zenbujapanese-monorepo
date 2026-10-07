import { describe, expect, test } from 'vitest'
import { browseCategories, browseCategory } from './categories'
import { kanjiList, pageCount, rankedPages, rankPage } from './lists'
import { browseService } from './service-paths'

const browsePages = [
  'kana',
  'hiragana',
  'katakana',
  'kanji',
  'frequency-dictionaries',
  'parts-of-speech',
  'usage',
  'subjects'
]

describe('categories', () => {
  test('each has its own slug, and none takes the name of a browse page', () => {
    const slugs = browseCategories.map(category => category.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs.filter(slug => browsePages.includes(slug))).toEqual([])
    expect(slugs.every(slug => /^[a-z]+(-[a-z]+)*$/u.test(slug))).toBe(true)
  })

  test('name the labels the importer keeps', () => {
    expect(browseCategory('onomatopoeia')).toMatchObject({
      kind: 'usage',
      labels: ['onomatopoeic']
    })
    expect(browseCategory('food-and-cooking')).toMatchObject({ kind: 'subject', labels: ['food'] })
    expect(browseCategory('suru-verbs')?.labels).toEqual(['takesSuru', 'suruVerb'])
    expect(browseCategory('nothing')).toBeUndefined()
  })
})

describe('pages', () => {
  test('hold 200 words, and an empty list still has its first page', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(200)).toBe(1)
    expect(pageCount(201)).toBe(2)
  })

  test('cover a ranked list’s ranks 200 at a time, to rank 10,000', () => {
    expect(rankPage(1)).toBe(1)
    expect(rankPage(1_001)).toBe(6)
    expect(rankedPages).toBe(50)
  })
})

describe('kanji lists', () => {
  test('are the school grades, secondary school, jinmeiyō, the JLPT levels, and each stroke count', () => {
    expect(kanjiList('grade-2')?.grades).toEqual([2])
    expect(kanjiList('jinmeiyo')?.grades).toEqual([9, 10])
    expect(kanjiList('jlpt-n3')).toEqual({ slug: 'jlpt-n3', name: 'JLPT N3', jlptLevel: 3 })
    expect(kanjiList('strokes-12')).toMatchObject({ strokes: 12, name: '12 strokes' })
    expect(kanjiList('strokes-0')).toBeUndefined()
    expect(kanjiList('grade-7')).toBeUndefined()
    expect(kanjiList('jlpt-n6')).toBeUndefined()
  })
})

describe('browseService, the service paths the website asks', () => {
  test('encode kana, and name a two-kana group under its first kana', () => {
    expect(browseService.kanaWords('hiragana', 'かが', 2).path).toBe(
      `/v1/browse/kana/hiragana/${encodeURIComponent('か')}/${encodeURIComponent('かが')}?page=2`
    )
    expect(browseService.categoryWords('nouns', 3).path).toBe('/v1/browse/categories/nouns?page=3')
  })
})

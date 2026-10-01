import type { SearchResultsScreen } from '@zenbu/dictionary-core/results/results'
import { describe, expect, test } from 'vitest'
import type { KanjiDetailsData } from '../data'
import { isIndexable, linkSearchScreen, type SearchLinks } from './links'

const kanjiOnly: SearchResultsScreen = {
  state: 'results',
  query: '㐂',
  sections: ['results'],
  examples: null,
  readingRefinement: null,
  kanji: { character: '㐂', label: 'KANJI', summary: 'Kanji detail', entryId: null },
  rows: [],
  resultCount: 1
}

const yorokobi: KanjiDetailsData = {
  character: '㐂',
  stats: [{ label: 'Strokes', value: '12' }],
  meanings: ['joy'],
  readings: [],
  components: [],
  elements: [],
  words: [],
  strokeOrder: null,
  shareText: '㐂'
}

const iruId = 'd12d09f1107aef0f7d43b54b62f0b7e1'

const iru: SearchResultsScreen = {
  ...kanjiOnly,
  query: 'iru',
  kanji: null,
  readingRefinement: { query: 'いる', title: 'Search for「いる」' },
  rows: [
    {
      id: iruId,
      entSeq: 1546640,
      headword: '要る',
      reading: 'いる',
      ruby: [],
      summary: 'to be needed',
      chips: [],
      retrievalOrder: 3
    },
    {
      id: 'x',
      entSeq: 1358280,
      headword: '食べる',
      reading: 'たべる',
      ruby: [],
      summary: 'to eat',
      chips: [],
      retrievalOrder: 0
    }
  ],
  resultCount: 2
}

const loaded: SearchLinks = { dictionaryLoaded: true, kanji: null }

describe('linkSearchScreen', () => {
  test('links every word when the dictionary service answers, and the refinement', () => {
    const data = linkSearchScreen(iru, loaded)
    expect(data).toMatchObject({
      readingRefinement: { path: '/dictionary/search/%E3%81%84%E3%82%8B/' },
      rows: [{ path: '/dictionary/要る-1546640/' }, { path: '/dictionary/食べる-1358280/' }]
    })
  })

  test('links only fixture words without the dictionary service', () => {
    const data = linkSearchScreen(iru, { dictionaryLoaded: false, kanji: null })
    expect(data.state === 'results' && data.rows.map(row => row.path)).toEqual([
      '/dictionary/要る-1546640/',
      null
    ])
  })

  test('gives the kanji row the kanji’s details, when the dictionary has them', () => {
    for (const kanji of [yorokobi, null]) {
      const data = linkSearchScreen(kanjiOnly, { dictionaryLoaded: true, kanji })
      expect(data.state === 'results' && data.kanji).toEqual({
        ...kanjiOnly.kanji,
        details: kanji
      })
    }
  })
})

describe('where the Example Sentences row leads', () => {
  const withExamples = (
    screen: SearchResultsScreen,
    query: string,
    primaryEntry: string | null
  ): SearchResultsScreen =>
    screen.state === 'results'
      ? {
          ...screen,
          query,
          sections: ['examples', ...screen.sections],
          examples: { title: 'View 3 Example Sentences', count: 3, primaryEntry }
        }
      : screen
  const target = (screen: SearchResultsScreen, links = loaded) => {
    const data = linkSearchScreen(screen, links)
    return data.state === 'results' ? data.examples?.target : undefined
  }

  test('an English search without a primary entry lists its examples on the page', () => {
    expect(target(withExamples(iru, 'eat', null))).toEqual({ kind: 'inline' })
    expect(target(withExamples(iru, 'it is', null))).toEqual({ kind: 'inline' })
  })

  test('a Japanese search opens its top word’s Examples section', () => {
    expect(target(withExamples(iru, 'いる', null))).toEqual({
      kind: 'word',
      path: '/dictionary/要る-1546640/#examples'
    })
  })

  test('a search with a primary entry opens that word’s Examples section, in either script', () => {
    const primaryListedLast = withExamples({ ...iru, rows: [...iru.rows].reverse() }, 'iru', iruId)
    expect(target(primaryListedLast)).toEqual({
      kind: 'word',
      path: '/dictionary/要る-1546640/#examples'
    })
    expect(target({ ...primaryListedLast, query: '要ります' })).toEqual({
      kind: 'word',
      path: '/dictionary/要る-1546640/#examples'
    })
  })

  test('a primary entry missing from the rows leaves English inline, and Japanese on the top word', () => {
    expect(target(withExamples(iru, 'iru', 'missing'))).toEqual({ kind: 'inline' })
    expect(target(withExamples(iru, '要ります', 'missing'))).toEqual({
      kind: 'word',
      path: '/dictionary/要る-1546640/#examples'
    })
  })

  test('a word without a page lists its examples on the page', () => {
    const unlisted = withExamples({ ...iru, rows: [...iru.rows].reverse() }, 'たべる', null)
    expect(target(unlisted, { dictionaryLoaded: false, kanji: null })).toEqual({ kind: 'inline' })
  })

  test('a search without examples has no row', () => {
    expect(target(iru)).toBeUndefined()
  })
})

describe('isIndexable', () => {
  test('indexes a page that lists words', () => {
    expect(isIndexable(linkSearchScreen(iru, loaded))).toBe(true)
  })

  test('indexes a one-kanji query with no words only when its kanji has meanings or readings', () => {
    const indexed = (kanji: KanjiDetailsData | null) =>
      isIndexable(linkSearchScreen(kanjiOnly, { ...loaded, kanji }))
    expect(indexed(null)).toBe(false)
    expect(indexed(yorokobi)).toBe(true)
    expect(indexed({ ...yorokobi, meanings: [] })).toBe(false)
    expect(
      indexed({
        ...yorokobi,
        meanings: [],
        readings: [{ kind: 'on', label: 'On', value: 'キ', words: [] }]
      })
    ).toBe(true)
  })

  test('never indexes No Dictionary Matches', () => {
    expect(isIndexable({ state: 'noResults', query: 'qzxvkj' })).toBe(false)
  })
})

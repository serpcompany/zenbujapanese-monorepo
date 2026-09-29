import { describe, expect, test } from 'vitest'
import { isIndexable, linkedWords, linkSearchScreen, resultsPerPage } from './links'
import type { ResultRow, SearchResultsScreen } from './results'

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

const iru: SearchResultsScreen = {
  ...kanjiOnly,
  query: 'iru',
  sections: ['examples', 'readingRefinement', 'results'],
  examples: { title: 'View 3 Example Sentences', count: 3, primaryEntry: 'x' },
  kanji: null,
  readingRefinement: { query: 'いる', title: 'Search for「いる」' },
  rows: [
    {
      id: 'd12d09f1107aef0f7d43b54b62f0b7e1',
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

/** A search listing the app's 60 words. */
const sixty: SearchResultsScreen = {
  ...iru,
  query: 'い',
  rows: Array.from(
    { length: 60 },
    (_, index): ResultRow => ({
      ...(iru.state === 'results' ? iru.rows[0] : ({} as ResultRow)),
      id: String(index),
      entSeq: 1_000_000 + index
    })
  ),
  resultCount: 60
}

const links = { dictionaryLoaded: true, kanjiHasPage: false, build: 'b1' }

describe('linkSearchScreen', () => {
  test('links every word once the dictionary database is loaded, the refinement, and the examples', () => {
    const data = linkSearchScreen(iru, links)
    expect(data).toMatchObject({
      examples: { title: 'View 3 Example Sentences', path: '/dictionary/search/iru/examples/' },
      readingRefinement: { path: '/dictionary/search/%E3%81%84%E3%82%8B/' },
      rows: [{ path: '/dictionary/要る-1546640/' }, { path: '/dictionary/食べる-1358280/' }],
      wordCount: 2,
      rowsPath: null
    })
  })

  test('links only fixture words without the dictionary database', () => {
    const data = linkSearchScreen(iru, { ...links, dictionaryLoaded: false })
    expect(data.state === 'results' && data.rows.map(row => row.path)).toEqual([
      '/dictionary/要る-1546640/',
      null
    ])
  })

  test('links the kanji row only to a kanji page that exists', () => {
    for (const kanjiHasPage of [true, false]) {
      const data = linkSearchScreen(kanjiOnly, { ...links, kanjiHasPage })
      expect(data.state === 'results' && data.kanji?.path).toBe(
        kanjiHasPage ? '/dictionary/kanji/㐂/' : null
      )
    }
  })

  test('renders the first 25 words and loads the rest from the build’s rows route', () => {
    const data = linkSearchScreen(sixty, links)
    expect(data.state === 'results' && data.rows.length).toBe(resultsPerPage)
    expect(data).toMatchObject({
      wordCount: 60,
      rowsPath: '/dictionary/search/%E3%81%84/results.json?build=b1'
    })
    // The pages the route serves, from each multiple of 25, list every word once, in order.
    const all = linkedWords(sixty, true)
    const paged = [
      ...(data.state === 'results' ? data.rows : []),
      ...all.slice(25, 50),
      ...all.slice(50, 75)
    ]
    expect(paged.map(row => row.id)).toEqual(all.map(row => row.id))
    expect(new Set(paged.map(row => row.id)).size).toBe(60)
  })

  test('renders every word when it has no build to page from', () => {
    const data = linkSearchScreen(sixty, { ...links, build: null })
    expect(data).toMatchObject({ wordCount: 60, rowsPath: null })
    expect(data.state === 'results' && data.rows.length).toBe(60)
  })
})

describe('isIndexable', () => {
  test('indexes a page that lists words', () => {
    expect(isIndexable(linkSearchScreen(iru, links))).toBe(true)
  })

  test('indexes a one-kanji query with no words only when its kanji has a page', () => {
    expect(isIndexable(linkSearchScreen(kanjiOnly, links))).toBe(false)
    expect(isIndexable(linkSearchScreen(kanjiOnly, { ...links, kanjiHasPage: true }))).toBe(true)
  })

  test('never indexes No Dictionary Matches', () => {
    expect(isIndexable({ state: 'noResults', query: 'qzxvkj' })).toBe(false)
  })
})

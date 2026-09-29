import type { SearchResultsScreen } from '@zenbu/dictionary-core/results/results'
import { describe, expect, test } from 'vitest'
import { isIndexable, linkSearchScreen } from './links'

const kanjiOnly: SearchResultsScreen = {
  state: 'results',
  query: '㐂',
  sections: ['results'],
  readingRefinement: null,
  kanji: { character: '㐂', label: 'KANJI', summary: 'Kanji detail', entryId: null },
  rows: [],
  resultCount: 1
}

const iru: SearchResultsScreen = {
  ...kanjiOnly,
  query: 'iru',
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

describe('linkSearchScreen', () => {
  test('links every word once the dictionary database is loaded, and the refinement', () => {
    const data = linkSearchScreen(iru, { dictionaryLoaded: true, kanjiHasPage: false })
    expect(data).toMatchObject({
      readingRefinement: { path: '/dictionary/search/%E3%81%84%E3%82%8B/' },
      rows: [{ path: '/dictionary/要る-1546640/' }, { path: '/dictionary/食べる-1358280/' }]
    })
  })

  test('links only fixture words without the dictionary database', () => {
    const data = linkSearchScreen(iru, { dictionaryLoaded: false, kanjiHasPage: false })
    expect(data.state === 'results' && data.rows.map(row => row.path)).toEqual([
      '/dictionary/要る-1546640/',
      null
    ])
  })

  test('links the kanji row only to a kanji page that exists', () => {
    for (const kanjiHasPage of [true, false]) {
      const data = linkSearchScreen(kanjiOnly, { dictionaryLoaded: true, kanjiHasPage })
      expect(data.state === 'results' && data.kanji?.path).toBe(
        kanjiHasPage ? '/dictionary/kanji/㐂/' : null
      )
    }
  })
})

describe('isIndexable', () => {
  const links = { dictionaryLoaded: true, kanjiHasPage: false }

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

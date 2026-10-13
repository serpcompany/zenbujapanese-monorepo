import { describe, expect, test } from 'vitest'
import { accentedPositions, type ExamplesEntry } from './word-examples'

const see: ExamplesEntry = {
  id: 'v1',
  headword: '見る',
  reading: 'みる',
  partsOfSpeech: ['ichidanVerb'],
  writtenForms: ['見る'],
  readingForms: ['みる']
}

const words = (surfaces: readonly string[], entries: Record<string, string> = {}) =>
  surfaces.map(surface => ({
    surface,
    entry: Object.hasOwn(entries, surface)
      ? { id: entries[surface], reading: surface, partsOfSpeech: [] }
      : null
  }))

describe('the words a sentence accents for a query (queryScalarRanges, matchesQuery)', () => {
  const accented = (text: string, surfaces: readonly string[], query: string) =>
    accentedPositions(text, words(surfaces), { entry: null, query, accent: 'query' })

  test('accents each word that overlaps an occurrence of the query', () => {
    expect(accented('猫を見た。', ['猫', 'を', '見た', '。'], '見た')).toEqual([2])
    expect(accented('見たい', ['見', 'たい'], '見た')).toEqual([0, 1])
    expect(accented('見た見た', ['見た', '見た'], '見た')).toEqual([0, 1])
  })

  test('counts Unicode scalars, as the app does', () => {
    expect(accented('𠀋を見た', ['𠀋', 'を', '見た'], '見た')).toEqual([2])
  })

  test('accents nothing for a query that differs from the spelling, such as Ｈ (h), or is empty', () => {
    expect(accented('Ｈです', ['Ｈ', 'です'], 'h')).toEqual([])
    expect(accented('猫を見た。', ['猫', 'を', '見た', '。'], '')).toEqual([])
  })

  test('accents the query’s words even on a page with an entry of its own', () => {
    expect(
      accentedPositions('猫を見た', words(['猫', 'を', '見た'], { 見た: 'v1' }), {
        entry: see,
        query: '猫',
        accent: 'query'
      })
    ).toEqual([0])
  })
})

describe('the words a sentence accents for a page’s entry (isPageWord)', () => {
  const linked = words(['見た', 'から', '見る'], { 見た: 'v1', から: 'p1', 見る: 'v1' })

  test('accents each word linked to the entry, however it is written', () => {
    expect(
      accentedPositions('見たから見る', linked, { entry: see, query: '見る', accent: 'entry' })
    ).toEqual([0, 2])
  })

  test('accents nothing without an entry, whatever the query', () => {
    expect(
      accentedPositions('見たから見る', linked, { entry: null, query: '見る', accent: 'entry' })
    ).toEqual([])
  })
})

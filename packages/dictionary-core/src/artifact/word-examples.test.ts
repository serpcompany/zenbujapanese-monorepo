import { describe, expect, test } from 'vitest'
import type { LinkEntry } from '../examples/linking'
import type { KuromojiToken } from '../examples/morphology'
import { accentedPositions, type ExamplesEntry, segmentText } from './word-examples'

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

describe('the words a sentence accents for a query', () => {
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

describe('the words a sentence accents for a page’s entry', () => {
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

describe('the words a page’s text is split into', () => {
  const noRows = { all: () => [] }
  const word = (surface: string, pos: string, reading: string): KuromojiToken => ({
    word_type: 'KNOWN',
    word_position: 1,
    surface_form: surface,
    pos,
    pos_detail_1: '*',
    pos_detail_2: '*',
    pos_detail_3: '*',
    basic_form: surface,
    reading
  })
  const entry = (id: string, reading: string): LinkEntry => ({
    id,
    reading,
    partsOfSpeech: ['pronoun']
  })
  const families: Record<string, LinkEntry[]> = {
    何: [entry('nani', 'なに'), entry('nan', 'なん')],
    これ: [entry('kore', 'これ'), entry('kore-other', 'これ')]
  }
  const capabilities = (said: KuromojiToken) => ({
    tokenize: () => [said],
    lookup: (form: string) => families[form] ?? []
  })

  test('links 何 to the entry its reading picks, and names the others written 何 when asked', () => {
    const split = segmentText(noRows, '何', capabilities(word('何', '名詞', 'ナニ')), {
      writtenAlike: true
    })
    expect(split.tokens).toEqual([
      { text: '何', reading: 'なに', languageReferenceID: 'nani', writtenAlike: ['nan'] }
    ])
  })

  test('names no others unless asked, as the dictionary service answers', () => {
    const split = segmentText(noRows, '何', capabilities(word('何', '名詞', 'ナニ')))
    expect(split.tokens).toEqual([{ text: '何', reading: 'なに', languageReferenceID: 'nani' }])
  })

  test('names no others for a word written in kana alone', () => {
    const split = segmentText(noRows, 'これ', capabilities(word('これ', '名詞', 'コレ')), {
      writtenAlike: true
    })
    expect(split.tokens.map(token => token.writtenAlike)).toEqual([undefined])
  })
})

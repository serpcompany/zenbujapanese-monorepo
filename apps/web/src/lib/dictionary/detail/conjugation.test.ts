import { describe, expect, test } from 'vitest'
import {
  canonicalMode,
  conjugationTable,
  formsFor,
  indexedForms,
  isConjugationKind,
  rowShowsFurigana,
  sharedSpellings
} from './conjugation'

// Expected values follow JapaneseConjugator in JapaneseConjugationClient.swift and
// ConjugationsView.swift. The word-detail suite checks the port against the app for every case
// with a table; these cover each rule's edges.

const table = (headword: string, reading: string, partsOfSpeech: string[]) =>
  conjugationTable({ headword, reading, partsOfSpeech })

const surfaces = (headword: string, reading: string, parts: string[], mode: 'Plain' | 'Polite') => {
  const found = table(headword, reading, parts)
  return found ? formsFor(found, mode).map(form => form.surface) : null
}

describe('conjugationTable (JapaneseConjugator.table)', () => {
  test('godan verbs change the final kana; 行く takes った and って', () => {
    expect(surfaces('書く', 'かく', ['godanVerb'], 'Plain')?.slice(0, 5)).toEqual([
      '書く',
      '書いた',
      '書かない',
      '書かなかった',
      '書いて'
    ])
    expect(surfaces('行く', 'いく', ['godanVerb'], 'Plain')?.slice(1, 2)).toEqual(['行った'])
    expect(surfaces('買う', 'かう', ['godanVerb'], 'Polite')?.[0]).toBe('買います')
  })

  test('する verbs keep the noun; 来る changes its reading', () => {
    // The app's rule appends できる to the noun (app bug #521); the port copies it.
    expect(surfaces('愛する', 'あいする', ['suruVerb'], 'Plain')?.[5]).toBe('愛できる')
    const kuru = table('来る', 'くる', ['kuruVerb'])
    expect(kuru?.plain[2]).toEqual({
      kind: 'negative',
      surface: '来ない',
      reading: 'こない',
      ending: '来ない'
    })
    expect(surfaces('くる', 'くる', ['kuruVerb'], 'Plain')?.[2]).toBe('こない')
  })

  test('adjectives have one register; いい and nouns have no table', () => {
    const takai = table('高い', 'たかい', ['iAdjective'])
    expect(takai?.polite).toEqual([])
    expect(takai && formsFor(takai, 'Polite')).toEqual(takai?.plain)
    expect(table('いい', 'いい', ['iAdjective'])).toBeNull()
    expect(table('学校', 'がっこう', ['noun'])).toBeNull()
    // A verb whose written and read endings differ has none.
    expect(table('見る', 'みた', ['ichidanVerb'])).toBeNull()
  })

  test('the first class the app checks wins: する before ichidan and godan', () => {
    expect(table('愛する', 'あいする', ['godanVerb', 'suruVerb'])?.rule).toBe(
      'Conjugate する like an irregular verb after the noun.'
    )
  })
})

describe('what the screens show', () => {
  test('potential and passive 見られる share a spelling', () => {
    const miru = table('見る', 'みる', ['ichidanVerb'])
    if (!miru) throw new Error('No table')
    const potential = miru.plain.find(form => form.kind === 'potential')
    if (!potential) throw new Error('No potential form')
    expect(sharedSpellings(miru, potential, 'Plain')).toEqual(['Passive'])
  })

  test('a row shows furigana only when its ending has kanji', () => {
    const kuru = table('来る', 'くる', ['kuruVerb'])
    expect(kuru?.plain.every(rowShowsFurigana)).toBe(true)
    expect(table('見る', 'みる', ['ichidanVerb'])?.plain.some(rowShowsFurigana)).toBe(false)
  })
})

describe('which form pages search engines index', () => {
  const miru = conjugationTable({
    headword: '見る',
    reading: 'みる',
    partsOfSpeech: ['ichidanVerb']
  })
  if (!miru) throw new Error('見る has no table')

  test('a Polite form spelled as its Plain form names the Plain page (te-form, conditional)', () => {
    const polite = (kind: string) => formsFor(miru, 'Polite').find(form => form.kind === kind)
    const te = polite('te-form')
    const past = polite('past')
    if (!te || !past) throw new Error('No form')
    expect(canonicalMode(miru.plain, 'Polite', te)).toBe('Plain')
    expect(canonicalMode(miru.plain, 'Polite', past)).toBe('Polite')
    expect(canonicalMode(miru.plain, 'Plain', miru.plain[0])).toBe('Plain')
  })

  test('indexes each canonical form page that lists examples', () => {
    const withExamples = new Set(['見る', '見た', '見て', '見ました'])
    expect(indexedForms(miru, surface => withExamples.has(surface))).toEqual([
      'plain/present-future',
      'plain/past',
      'plain/te-form',
      'polite/past'
    ])
  })

  test('knows the app’s kinds', () => {
    expect(isConjugationKind('past-negative')).toBe(true)
    expect(isConjugationKind('toString')).toBe(false)
  })
})

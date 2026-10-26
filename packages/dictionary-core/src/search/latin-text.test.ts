import { describe, expect, test } from 'vitest'
import { latinSpellings } from './latin-text'

describe('the spellings English search tries for a query in other Latin letters than romaji’s', () => {
  test('a word with accents, as typed, then without them', () => {
    expect(latinSpellings('café')).toEqual(['café', 'cafe'])
    expect(latinSpellings('crème brûlée')).toEqual(['crème brûlée', 'creme brulee'])
    expect(latinSpellings('façade')).toEqual(['façade', 'facade'])
  })

  test('a letter with no accent to take off, as typed', () => {
    expect(latinSpellings('spaß')).toEqual(['spaß'])
    expect(latinSpellings('smørrebrød')).toEqual(['smørrebrød'])
  })

  test('none for what romaji search reads, ASCII and macron romaji, which keep their own route', () => {
    expect(latinSpellings('cafe')).toEqual([])
    expect(latinSpellings('rāmen')).toEqual([])
  })

  test('none for Japanese text, or text with no Latin letter', () => {
    expect(latinSpellings('カフェ')).toEqual([])
    expect(latinSpellings('caféオレ')).toEqual([])
    expect(latinSpellings('σ')).toEqual([])
  })
})

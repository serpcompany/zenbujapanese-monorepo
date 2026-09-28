import { describe, expect, test } from 'vitest'
import { deinflect } from './deinflect'
import { isJapaneseOnly, isMixedScript, normalizeQuery, romajiDeinflectedCandidates } from './query'

describe('normalizeQuery', () => {
  test('folds width and case and collapses whitespace', () => {
    expect(normalizeQuery('  Ｔａｂｅｒｕ   Ｎｏｗ ')).toBe('taberu now')
  })
})

describe('scripts', () => {
  test('tells Japanese-only queries from mixed ones', () => {
    expect(isJapaneseOnly('食べる')).toBe(true)
    expect(isJapaneseOnly('taberu')).toBe(false)
    expect(isMixedScript('taberu 食べる')).toBe(true)
  })
})

describe('romajiDeinflectedCandidates', () => {
  test('offers dictionary forms for inflected romaji', () => {
    expect(romajiDeinflectedCandidates('tabeta')).toEqual(['taberu'])
    expect(romajiDeinflectedCandidates('itta')).toEqual(['iku', 'iu', 'itsu', 'iru', 'itru'])
  })
})

describe('deinflect', () => {
  test('finds the dictionary form behind common inflections', () => {
    const terms = (text: string) => deinflect(text).map(candidate => candidate.term)
    expect(terms('食べた')).toContain('食べる')
    expect(terms('行きました')).toContain('行く')
    expect(terms('高くて')).toContain('高い')
    expect(terms('勉強した')).toContain('勉強')
  })
})

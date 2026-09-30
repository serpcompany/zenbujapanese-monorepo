import { describe, expect, test } from 'vitest'
import { deinflect } from './deinflect'
import {
  compareStrings,
  isJapaneseOnly,
  isMixedScript,
  normalizeQuery,
  romajiDeinflectedCandidates
} from './query'

describe('compareStrings', () => {
  const sign = (lhs: string, rhs: string) => Math.sign(compareStrings(lhs, rhs))

  test('orders by Unicode scalar, as Swift does', () => {
    expect(sign('0a1b', '0a1c')).toBe(-1)
    expect(sign('食べる', '食べ')).toBe(1)
    expect(sign('abc', 'abc')).toBe(0)
    // U+FF21 (Ａ) is a smaller scalar than U+20000 (𠀀), though its UTF-16 unit is larger than the
    // high surrogate that starts 𠀀.
    const fullwidthA = String.fromCodePoint(0xff21)
    const supplementary = String.fromCodePoint(0x20000)
    expect(sign(`x${fullwidthA}`, `x${supplementary}`)).toBe(-1)
    expect(sign(`x${supplementary}`, `x${fullwidthA}`)).toBe(1)
    expect(sign(supplementary, `${supplementary}a`)).toBe(-1)
  })
})

describe('normalizeQuery', () => {
  test('folds width and case and collapses whitespace', () => {
    expect(normalizeQuery('  Ｔａｂｅｒｕ   Ｎｏｗ ')).toBe('taberu now')
    expect(normalizeQuery('食べ　る')).toBe('食べ る')
  })

  test('splits words where Swift does, by grapheme', () => {
    // NFKC turns ゛ into a space and a combining mark, one grapheme that starts with whitespace.
    expect(normalizeQuery('あ゛')).toBe('あ')
    expect(normalizeQuery('eat\u0085now')).toBe('eat now')
    expect(normalizeQuery('﻿taberu')).toBe('﻿taberu')
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

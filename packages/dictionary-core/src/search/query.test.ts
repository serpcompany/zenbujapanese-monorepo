import { describe, expect, test } from 'vitest'
import { acceptsPartsOfSpeech, deinflect } from './deinflect'
import {
  compareStrings,
  isJapaneseOnly,
  isMixedScript,
  japaneseCandidates,
  normalizeQuery,
  romajiDeinflectedCandidates
} from './query'

describe('compareStrings', () => {
  const sign = (lhs: string, rhs: string) => Math.sign(compareStrings(lhs, rhs))

  test('orders by Unicode scalar, as Swift does', () => {
    expect(sign('0a1b', '0a1c')).toBe(-1)
    expect(sign('食べる', '食べ')).toBe(1)
    expect(sign('abc', 'abc')).toBe(0)
  })

  test('orders a smaller scalar first even when its UTF-16 unit is larger than a surrogate', () => {
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

  test('joins a halfwidth kana and its voiced mark, and ends a Greek word in a final sigma', () => {
    expect(normalizeQuery('\uff76\uff9e\uff77\uff9e')).toBe('\u30ac\u30ae')
    expect(normalizeQuery('\uff8a\uff9f')).toBe('\u30d1')
    expect(normalizeQuery('か\u3099')).toBe('\u304c')
    expect(normalizeQuery('ΌΣΟΣ')).toBe('όσος')
  })

  test('leaves a query with no whitespace as folding made it', () => {
    expect(normalizeQuery('食べる')).toBe('食べる')
    expect(normalizeQuery('か\u3099')).toBe('\u304c')
    expect(normalizeQuery('TABERU')).toBe('taberu')
    expect(normalizeQuery('')).toBe('')
  })

  test('drops a grapheme that starts with whitespace, as NFKC makes ゛', () => {
    expect(normalizeQuery('あ゛')).toBe('あ')
  })

  test('splits words where Swift does, by grapheme', () => {
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

describe('japaneseCandidates', () => {
  test('keeps what is written only in Japanese, normalized, each once, in order', () => {
    expect(japaneseCandidates(['見る', 'ﾐﾙ', 'miru', '見る', '見る!', '', ' 木 ', 'ミル'])).toEqual(
      ['見る', 'ミル', '木']
    )
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

  test('carries the word class the dictionary form must have, through a chain of endings', () => {
    const classes = (text: string, term: string) =>
      deinflect(text)
        .filter(candidate => candidate.term === term)
        .flatMap(candidate => candidate.wordClasses)
    expect(classes('まけたら', 'まける')).toContain('ichidan')
    expect(classes('まけたら', 'まけたら')).toEqual([])
    expect(classes('食べさせられなかったら', '食べる')).toContain('ichidan')
  })
})

describe('acceptsPartsOfSpeech', () => {
  test('lets a word class accept only the parts of speech that inflect its way', () => {
    expect(acceptsPartsOfSpeech('ichidan', ['ichidanVerb'])).toBe(true)
    expect(acceptsPartsOfSpeech('ichidan', ['noun'])).toBe(false)
    expect(acceptsPartsOfSpeech('godan', ['godanVerb'])).toBe(true)
    expect(acceptsPartsOfSpeech('iAdjective', ['iAdjective'])).toBe(true)
    expect(acceptsPartsOfSpeech('suruNoun', ['noun', 'takesSuru', 'transitive'])).toBe(true)
    expect(acceptsPartsOfSpeech('suruNoun', ['noun', 'transitive'])).toBe(false)
  })
})

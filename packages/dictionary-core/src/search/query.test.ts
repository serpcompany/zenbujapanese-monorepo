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

  test('separates words at white space and at U+FEFF', () => {
    expect(normalizeQuery('eat\u{85}now')).toBe('eat now')
    expect(normalizeQuery('eat\u{FEFF}now')).toBe('eat now')
    expect(normalizeQuery('\u{FEFF}taberu\u{FEFF}')).toBe('taberu')
    expect(normalizeQuery('\u{FEFF}')).toBe('')
  })

  test('drops a combining mark with the separator before it, whichever separator that is', () => {
    expect(normalizeQuery('eat \u{301}now')).toBe('eat now')
    expect(normalizeQuery('eat\t\u{301}now')).toBe('eat now')
    expect(normalizeQuery('eat\n\u{3099}now')).toBe('eat now')
    expect(normalizeQuery('eat\u{85}\u{301}now')).toBe('eat now')
    expect(normalizeQuery('eat\u{FEFF}\u{301}now')).toBe('eat now')
    expect(normalizeQuery('\t\u{301}now')).toBe('now')
    expect(normalizeQuery('\u{301}now')).toBe('\u{301}now')
  })

  test('separates at a space after a prepended mark, leaving none at an end or doubled', () => {
    expect(normalizeQuery('\u{600} ')).toBe('\u{600}')
    expect(normalizeQuery('a\u{600}  b')).toBe('a\u{600} b')
    expect(normalizeQuery('a\u{600} \u{301}b')).toBe('a\u{600} b')
  })
})

describe('normalizeQuery, on every pairing of separators, marks, and letters', () => {
  const basicPlane = Array.from({ length: 0x10000 }, (_, unit) => String.fromCharCode(unit))
  const whiteSpace = basicPlane.filter(character => /\p{White_Space}/u.test(character))
  const foldedToASpaceAndAMark = basicPlane.filter(character =>
    /^ \p{M}/u.test(character.normalize('NFKC'))
  )
  const marks = ['\u{301}', '\u{3099}', '\u{903}', '\u{200D}', '\u{FE0F}', '\u{1F3FB}']
  const characters = [
    ...whiteSpace,
    ...foldedToASpaceAndAMark,
    '\u{FEFF}',
    '\u{600}',
    ...marks,
    'a',
    'あ'
  ]
  const pairings = characters.flatMap(first => characters.map(second => first + second))
  const queries = pairings.flatMap(pair => [pair, `a${pair}`, `${pair}b`, `a${pair}b`])
  const separator = /[\p{White_Space}\u{FEFF}]/u
  const isWordsJoinedBySingleSpaces = (query: string) =>
    query === '' || query.split(' ').every(word => word !== '' && !separator.test(word))

  test('covers every white-space character and every character NFKC folds to a spaced mark', () => {
    expect(whiteSpace).toHaveLength(25)
    expect(foldedToASpaceAndAMark).toHaveLength(50)
  })

  test('returns its own answer unchanged', () => {
    expect(
      queries.filter(raw => normalizeQuery(normalizeQuery(raw)) !== normalizeQuery(raw))
    ).toEqual([])
  })

  test('joins words with one space each, and leaves no other separator', () => {
    expect(queries.filter(raw => !isWordsJoinedBySingleSpaces(normalizeQuery(raw)))).toEqual([])
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

import { describe, expect, test } from 'vitest'
import { locales } from '@/lib/i18n/config'
import { characters, descriptionLength, fitsTitle, siteTitle } from '@/lib/snippets'
import { type SnippetWord, wordDescription, wordTitle } from './word-snippet'

const ego: SnippetWord = {
  headword: 'エゴ',
  reading: 'エゴ',
  summary: 'ego',
  partOfSpeech: 'Noun',
  pitch: {},
  kanji: [],
  conjugations: null,
  exampleCount: { listed: 2 },
  examples: [{}, {}]
}

const iku: SnippetWord = {
  headword: '行く',
  reading: 'いく',
  summary: 'to go, to move (towards), to head (towards), to leave (for)',
  partOfSpeech: 'Godan verb (intransitive)',
  pitch: {},
  kanji: ['行'],
  conjugations: {},
  exampleCount: { listed: 100 },
  examples: [{}]
}

const rotouNiMayou: SnippetWord = {
  headword: '路頭に迷う',
  reading: 'ろとうにまよう',
  summary:
    'to be left without means of sustenance, to be turned adrift in the streets, to be rendered homeless, to be out in the cold, to be down and out',
  partOfSpeech: 'Expression · Godan verb',
  pitch: null,
  kanji: ['路', '頭', '迷'],
  conjugations: {},
  exampleCount: null,
  examples: []
}

const laborRelationsAct: SnippetWord = {
  headword: '特定独立行政法人等の労働関係に関する法律',
  reading: 'とくていどくりつぎょうせいほうじんとうのろうどうかんけいにかんするほうりつ',
  summary: 'Act on Labor Relationship of Specified Independent Administrative Agency, etc. (2002)',
  partOfSpeech: 'Expression · Noun',
  pitch: null,
  kanji: ['特', '定'],
  conjugations: null,
  exampleCount: { listed: 0 },
  examples: []
}

const realWords = [ego, iku, rotouNiMayou, laborRelationsAct]

describe('a word page’s description', () => {
  test('a short word says what it means, what its page has, and that the dictionary is free', () => {
    expect(wordDescription(ego, 'en')).toBe(
      'エゴ: ego. Noun. See its reading, every meaning, pitch accent, and 2 example sentences in the Zenbu Japanese dictionary.'
    )
    expect(wordDescription(ego, 'ja')).toBe(
      '「エゴ」は英語で「ego」という意味です。品詞は名詞。このページでは、この言葉の読み方、すべての意味、アクセント、例文2件を確認できます。Zenbu Japaneseの和英辞典は、ウェブでもiPhoneアプリでも無料で使えます。'
    )
  })

  test('a word with many features names the ones that fit, dropping every meaning first and conjugations last', () => {
    expect(wordDescription(iku, 'en')).toBe(
      '行く (いく): to go, to move (towards), to head (towards), to leave (for). Godan verb (intransitive). See its 100 example sentences in the Zenbu Japanese dictionary.'
    )
    expect(wordDescription(iku, 'ja')).toBe(
      '「行く（いく）」は英語で「to go, to move (towards), to head (towards), to leave (for)」という意味です。品詞は五段動詞（自動詞）。このページでは、この言葉の読み方、すべての意味、アクセント、漢字、活用、例文100件を確認できます。'
    )
  })

  test('a long meaning loses glosses from its end until it fits, never splitting one in parentheses', () => {
    expect(wordDescription(rotouNiMayou, 'en')).toBe(
      '路頭に迷う (ろとうにまよう): to be left without means of sustenance, to be turned adrift in the streets, to be rendered homeless. Expression · Godan verb.'
    )
    expect(wordDescription(laborRelationsAct, 'en')).toBe(
      '特定独立行政法人等の労働関係に関する法律 (とくていどくりつぎょうせいほうじんとうのろうどうかんけいにかんするほうりつ): Act on Labor Relationship of Specified Independent Administrative Agency. Expression · Noun.'
    )
    const parenthesized = {
      ...rotouNiMayou,
      summary: `${'to wander (lost, homeless), '.repeat(6)}to roam`
    }
    expect(wordDescription(parenthesized, 'en')).toMatch(/\(lost, homeless\)\. Expression/)
  })

  test.each(locales)('in %s, every real case is 110–160 characters', locale => {
    for (const word of realWords) {
      const length = characters(wordDescription(word, locale))
      expect(length, word.headword).toBeGreaterThanOrEqual(descriptionLength.shortest)
      expect(length, word.headword).toBeLessThanOrEqual(descriptionLength.longest)
    }
  })
})

describe('a word page’s title', () => {
  test('names the word and its reading when they fit', () => {
    expect(wordTitle(iku, 'en')).toBe('行く (いく) meaning')
    expect(wordTitle(iku, 'ja')).toBe('行く（いく）の英語・意味・例文')
    expect(wordTitle(ego, 'en')).toBe('エゴ meaning')
    expect(wordTitle(rotouNiMayou, 'ja')).toBe('路頭に迷う（ろとうにまよう）の英語・意味')
  })

  test('leaves the reading out when the title with it would pass 70 characters', () => {
    expect(wordTitle(laborRelationsAct, 'en')).toBe(
      '特定独立行政法人等の労働関係に関する法律 meaning'
    )
    expect(wordTitle(laborRelationsAct, 'ja')).toBe(
      '特定独立行政法人等の労働関係に関する法律の英語・意味'
    )
    for (const locale of locales) {
      for (const word of realWords) {
        expect(fitsTitle(wordTitle(word, locale)), siteTitle(wordTitle(word, locale))).toBe(true)
      }
    }
  })
})

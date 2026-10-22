import { describe, expect, test, vi } from 'vitest'
import {
  displayReading,
  type HighlightedEntry,
  isCompatible,
  type LinkEntry,
  linkedTokens,
  lookupForms
} from './linking'
import type { MorphologyCandidate } from './morphology'

function candidate(
  surface: string,
  partOfSpeech: string[],
  dictionaryForm = surface,
  reading = surface
): MorphologyCandidate {
  return {
    surface,
    dictionaryForm,
    normalizedForm: dictionaryForm,
    reading,
    partOfSpeech,
    isOutOfVocabulary: false,
    children: [],
    joinsInflection: false
  }
}

const entry = (id: string, reading: string, partsOfSpeech: string[]): LinkEntry => ({
  id,
  reading,
  partsOfSpeech
})

const iru: HighlightedEntry = {
  ...entry('need', 'いる', ['godanVerb']),
  headword: '要る',
  writtenForms: ['要る'],
  readingForms: ['いる']
}

function dictionary(forms: Record<string, LinkEntry[]>) {
  return vi.fn((form: string) => forms[form] ?? [])
}

describe('lookupForms', () => {
  test('the surface, dictionary form, and normalized form, each also in hiragana and katakana', () => {
    expect(lookupForms(candidate('ミル', ['動詞'], 'みる'))).toEqual(['ミル', 'みる'])
  })

  test("a joined inflection skips its surface, which isn't a dictionary form", () => {
    const joined = { ...candidate('しまった', ['動詞'], 'しまう'), joinsInflection: true }
    expect(lookupForms(joined)).toEqual(['しまう', 'シマウ'])
  })
})

describe('isCompatible', () => {
  test.each([
    ['godanVerb', '動詞', true],
    ['noun', '動詞', false],
    ['copula', '助動詞', true],
    ['iAdjective', '助動詞', true],
    ['particle', '助詞', true],
    ['noun', '記号', true]
  ])('%s with %s is %s', (part, provider, expected) => {
    expect(isCompatible(part, provider)).toBe(expected)
  })
})

describe('linkedTokens', () => {
  const needs = entry('need', 'いる', ['godanVerb'])
  const be = entry('be', 'いる', ['ichidanVerb'])
  const shoot = entry('shoot', 'いる', ['godanVerb'])

  test('a word written as one of the page entry’s forms is that entry', () => {
    const lookup = dictionary({})
    const tokens = linkedTokens(
      '要る',
      [candidate('要る', ['動詞'])],
      { entry: iru, query: '要る' },
      lookup
    )
    expect(tokens[0].entry?.id).toBe('need')
    expect(lookup).not.toHaveBeenCalled()
  })

  test('a word written as the page entry’s form in the other width is that entry too', () => {
    const tShirt: HighlightedEntry = {
      ...entry('t-shirt', 'ティーシャツ', ['noun']),
      headword: 'Ｔシャツ',
      writtenForms: ['Ｔシャツ'],
      readingForms: ['ティーシャツ']
    }
    const tokens = linkedTokens(
      'TシャツとＴシャツ',
      [candidate('Tシャツ', ['名詞']), candidate('と', ['助詞']), candidate('Ｔシャツ', ['名詞'])],
      { entry: tShirt, query: 'Ｔシャツ' },
      dictionary({})
    )
    expect(tokens.map(token => token.entry?.id ?? null)).toEqual(['t-shirt', null, 't-shirt'])
  })

  test('other words resolve by part of speech, then by reading, or list the candidates neither tells apart', () => {
    const lookup = dictionary({ いる: [needs, be, shoot], か: [entry('q', 'か', ['particle'])] })
    const [verb, particle] = linkedTokens(
      'いるか',
      [candidate('いる', ['動詞'], 'いる', 'イル'), candidate('か', ['助詞'], 'か', 'カ')],
      null,
      lookup
    )
    expect(verb.entry).toBeNull()
    expect(verb.candidates.map(c => c.id)).toEqual(['need', 'be', 'shoot'])
    expect(verb.lookupForm).toBe('いる')
    expect(particle.entry?.id).toBe('q')
  })

  test('the reading narrows a word found by its surface', () => {
    const lookup = dictionary({
      人: [entry('hito', 'ひと', ['noun']), entry('nin', 'にん', ['suffix'])]
    })
    const [token] = linkedTokens('人', [candidate('人', ['名詞'], '人', 'ヒト')], null, lookup)
    expect(token.entry?.id).toBe('hito')
  })

  test('a word that isn’t Japanese only links nowhere', () => {
    const lookup = dictionary({})
    const [token] = linkedTokens('YouTube', [candidate('YouTube', ['名詞'])], null, lookup)
    expect(token).toMatchObject({ entry: null, candidates: [] })
    expect(lookup).not.toHaveBeenCalled()
  })

  test('a joined word that resolves to nothing falls back to its pieces', () => {
    const pieces = [candidate('おせ', ['動詞'], 'おせる'), candidate('じ', ['助動詞'], 'じ')]
    const lookup = dictionary({ じ: [entry('ji', 'じ', ['auxiliary'])] })
    expect(linkedTokens('おせじ', pieces, null, lookup).map(t => t.surface)).toEqual(['おせ', 'じ'])
  })

  test('a joined word stays whole on the page of an entry written as it', () => {
    const pieces = [candidate('おせ', ['動詞'], 'おせる'), candidate('じ', ['助動詞'], 'じ')]
    const lookup = dictionary({ じ: [entry('ji', 'じ', ['auxiliary'])] })
    const oseji: HighlightedEntry = {
      ...entry('oseji', 'おせじ', ['noun']),
      headword: 'お世辞',
      writtenForms: ['お世辞'],
      readingForms: ['おせじ']
    }
    const tokens = linkedTokens('おせじ', pieces, { entry: oseji, query: 'お世辞' }, lookup)
    expect(tokens.map(t => [t.surface, t.entry?.id])).toEqual([['おせじ', 'oseji']])
  })

  test('a failed analysis is the whole text as one unlinked word', () => {
    expect(linkedTokens('文', null, null, dictionary({}))).toEqual([
      {
        surface: '文',
        entry: null,
        candidates: [],
        reading: '文',
        dictionaryForm: '文',
        partOfSpeech: [],
        lookupForm: null
      }
    ])
  })
})

describe('displayReading', () => {
  const kimi = { headword: '君', reading: 'きみ', writtenForms: ['君'], readingForms: ['きみ'] }

  test("the entry's reading when the word is one of its forms", () => {
    expect(displayReading({ surface: '君', reading: 'クン' }, kimi)).toBe('きみ')
  })

  test('the parsed reading, in hiragana, for an inflected word', () => {
    const miru = {
      headword: '見る',
      reading: 'みる',
      writtenForms: ['見る'],
      readingForms: ['みる']
    }
    expect(displayReading({ surface: '見なかった', reading: 'ミナカッタ' }, miru)).toBe(
      'みなかった'
    )
  })
})

describe('a number and its counter', () => {
  const numeral = (surface: string, reading: string) =>
    candidate(surface, ['名詞', '数'], surface, reading)
  const counter = (surface: string, reading: string) =>
    candidate(surface, ['名詞', '接尾', '助数詞'], surface, reading)
  const one = entry('one', 'いち', ['noun'])
  const person = entry('person', 'ひと', ['noun'])
  const oneDay = entry('one-day', 'いちにち', ['noun'])
  const firstOfTheMonth = entry('first-of-the-month', 'ついたち', ['noun'])
  const pieces = (tokens: ReturnType<typeof linkedTokens>) =>
    tokens.map(token => [token.surface, token.entry?.id ?? token.candidates.map(c => c.id)])

  test('link as the one word the dictionary has for them, read as that word', () => {
    const lookup = dictionary({
      一: [one],
      人: [person],
      一人: [entry('one-person', 'ひとり', ['noun', 'adverb'])]
    })
    const [alone] = linkedTokens(
      '一人',
      [numeral('一', 'イチ'), counter('人', 'ニン')],
      null,
      lookup
    )
    expect(alone).toMatchObject({ surface: '一人', reading: 'ヒトリ', entry: { id: 'one-person' } })
    expect(
      displayReading(alone, {
        headword: '一人',
        reading: 'ひとり',
        writtenForms: ['一人'],
        readingForms: ['ひとり', 'いちにん']
      })
    ).toBe('ひとり')
  })

  test('join a whole run of numerals, so 二十日 is はつか', () => {
    const lookup = dictionary({ 二十日: [entry('twentieth', 'はつか', ['noun'])] })
    const tokens = linkedTokens(
      '二十日',
      [numeral('二', 'ニ'), numeral('十', 'ジュウ'), counter('日', 'ニチ')],
      null,
      lookup
    )
    expect(pieces(tokens)).toEqual([['二十日', 'twentieth']])
  })

  test('take the entry the tokenizer’s reading names when the whole word is written for several', () => {
    const lookup = dictionary({ 一日: [oneDay, firstOfTheMonth] })
    const tokens = linkedTokens(
      '一日',
      [numeral('一', 'イチ'), counter('日', 'ニチ')],
      null,
      lookup
    )
    expect(pieces(tokens)).toEqual([['一日', 'one-day']])
  })

  test('stay as they link today when the whole word could be several, or the dictionary lacks it', () => {
    const twenty = entry('twenty-years', 'はたち', ['noun'])
    const twentyYears = entry('twenty-years-old', 'はたとせ', ['noun'])
    const lookup = dictionary({
      二: [entry('two', 'に', ['noun'])],
      十: [entry('ten', 'じゅう', ['noun'])],
      歳: [entry('age', 'とし', ['noun'])],
      二十歳: [twenty, twentyYears],
      一: [one],
      人: [person],
      一人: [entry('one-person', 'ひとり', ['noun'])]
    })
    const ages = [numeral('二', 'ニ'), numeral('十', 'ジュウ'), counter('歳', 'サイ')]
    expect(pieces(linkedTokens('二十歳', ages, null, lookup))).toEqual([
      ['二', 'two'],
      ['十', 'ten'],
      ['歳', 'age']
    ])
    const eleven = [numeral('十', 'ジュウ'), numeral('一', 'イチ'), counter('人', 'ニン')]
    expect(pieces(linkedTokens('十一人', eleven, null, lookup))).toEqual([
      ['十', 'ten'],
      ['一', 'one'],
      ['人', 'person']
    ])
  })

  test('keep the page’s own word itself, unless the page is the whole word’s', () => {
    const lookup = dictionary({
      一: [one],
      人: [person],
      一人: [entry('one-person', 'ひとり', ['noun'])]
    })
    const words = [numeral('一', 'イチ'), counter('人', 'ニン')]
    const ichi: HighlightedEntry = {
      ...one,
      headword: '一',
      writtenForms: ['一'],
      readingForms: ['いち']
    }
    expect(pieces(linkedTokens('一人', words, { entry: ichi, query: '一' }, lookup))).toEqual([
      ['一', 'one'],
      ['人', 'person']
    ])
    const hitori: HighlightedEntry = {
      ...entry('one-person', 'ひとり', ['noun']),
      headword: '一人',
      writtenForms: ['一人'],
      readingForms: ['ひとり']
    }
    expect(pieces(linkedTokens('一人', words, { entry: hitori, query: '一人' }, lookup))).toEqual([
      ['一人', 'one-person']
    ])
  })
})

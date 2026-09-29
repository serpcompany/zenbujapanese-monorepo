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

/** A lookup over a fixed dictionary, by exact form. */
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

  test('other words resolve by part of speech, then by reading, or list their candidates', () => {
    const lookup = dictionary({ いる: [needs, be, shoot], か: [entry('q', 'か', ['particle'])] })
    const [verb, particle] = linkedTokens(
      'いるか',
      [candidate('いる', ['動詞'], 'いる', 'イル'), candidate('か', ['助詞'], 'か', 'カ')],
      null,
      lookup
    )
    // Two godan and one ichidan entry: the parser can't tell them apart by part of speech.
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
    // Kuromoji's pieces, which the grouping joins into おせじ (dictionary form おせる).
    const pieces = [candidate('おせ', ['動詞'], 'おせる'), candidate('じ', ['助動詞'], 'じ')]
    const lookup = dictionary({ じ: [entry('ji', 'じ', ['auxiliary'])] })
    expect(linkedTokens('おせじ', pieces, null, lookup).map(t => t.surface)).toEqual(['おせ', 'じ'])
    // On the page of an entry written おせじ, the joined word is that entry and stays whole.
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

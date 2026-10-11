import { describe, expect, test } from 'vitest'
import { partOfSpeechPhrase } from './part-of-speech'

const phrase = (...parts: string[]) => partOfSpeechPhrase(parts)

describe('partOfSpeechPhrase', () => {
  test('transitivity modifies the verb class instead of repeating verb', () => {
    expect(phrase('godanVerb', 'intransitive')).toBe('Godan verb (intransitive)')
    expect(phrase('ichidanVerb', 'transitive')).toBe('Ichidan verb (transitive)')
    expect(phrase('godanVerb', 'transitive', 'intransitive')).toBe(
      'Godan verb (transitive or intransitive)'
    )
    expect(phrase('suruVerb', 'transitive')).toBe('する verb (transitive)')
    expect(phrase('kuruVerb', 'intransitive')).toBe('Irregular verb (intransitive)')
    expect(phrase('zuruVerb', 'transitive')).toBe('Zuru verb (transitive)')
    expect(phrase('archaicVerb')).toBe('Archaic verb')
    expect(phrase('auxiliaryVerb')).toBe('Auxiliary verb')
    expect(phrase('verb')).toBe('Verb')
    expect(phrase('godanVerb', 'verb')).toBe('Godan verb')
    expect(phrase('transitive')).toBe('Verb (transitive)')
  })

  test('a noun that takes する reads as a noun and a する verb', () => {
    expect(phrase('noun', 'takesSuru', 'transitive')).toBe('Noun · する verb (transitive)')
    expect(phrase('noun', 'takesSuru', 'transitive', 'intransitive')).toBe(
      'Noun · する verb (transitive or intransitive)'
    )
    expect(phrase('noun', 'takesSuru')).toBe('Noun · する verb')
    expect(phrase('takesSuru', 'suruVerb', 'transitive')).toBe('する verb (transitive)')
  })

  test('nouns, pronouns, and noun modifiers keep their own class', () => {
    expect(phrase('noun')).toBe('Noun')
    expect(phrase('pronoun')).toBe('Pronoun')
    expect(phrase('noun', 'noAdjective')).toBe('Noun (の)')
    expect(phrase('noAdjective', 'takesSuru')).toBe('Noun (の) · する verb')
    expect(phrase('nounPrefix')).toBe('Prefix')
    expect(phrase('nounSuffix')).toBe('Suffix')
    expect(phrase('noun', 'nounSuffix')).toBe('Noun · Suffix')
    expect(phrase('prenominal')).toBe('Prenominal')
    expect(phrase('preNounAdjective')).toBe('Pre-noun adjective')
  })

  test('adjectives and adverbs name their class', () => {
    expect(phrase('naAdjective', 'noun')).toBe('Na-adjective · Noun')
    expect(phrase('iAdjective')).toBe('I-adjective')
    expect(phrase('taruAdjective', 'adverbTo')).toBe('Taru adjective · Adverb (と)')
    expect(phrase('archaicAdjective')).toBe('Archaic adjective')
    expect(phrase('archaicNaAdjective')).toBe('Archaic na-adjective')
    expect(phrase('auxiliaryAdjective')).toBe('Auxiliary adjective')
    expect(phrase('adverb')).toBe('Adverb')
    expect(phrase('adverb', 'adverbTo', 'takesSuru')).toBe('Adverb (と) · する verb')
  })

  test('other categories use sentence case, keep order, and drop noise', () => {
    expect(phrase('expression', 'godanVerb')).toBe('Expression · Godan verb')
    expect(phrase('numeric')).toBe('Number')
    expect(phrase('auxiliary')).toBe('Auxiliary')
    expect(phrase('conjunction')).toBe('Conjunction')
    expect(phrase('copula')).toBe('Copula')
    expect(phrase('counter')).toBe('Counter')
    expect(phrase('interjection')).toBe('Interjection')
    expect(phrase('prefix')).toBe('Prefix')
    expect(phrase('suffix')).toBe('Suffix')
    expect(phrase('particle')).toBe('Particle')
    expect(phrase('unclassified')).toBe('')
    expect(phrase('unknownCategory')).toBe('')
    expect(phrase('constructor')).toBe('')
    expect(phrase('noun', 'noun')).toBe('Noun')
  })
})

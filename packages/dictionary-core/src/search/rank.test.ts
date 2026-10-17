import { describe, expect, test } from 'vitest'
import {
  compareEnglishRanks,
  comparePresentationRanks,
  type EnglishRank,
  EvidenceLane,
  FormRelation,
  type JapaneseRank,
  matchLabel,
  sameLexicalGroup
} from './rank'

const unmarked = { primaryMask: 0, secondaryMask: 0, newsFrequencyBand: null }

const english = (fingerprint: string, rank: Partial<EnglishRank> = {}): EnglishRank => ({
  kind: 'english',
  lane: EvidenceLane.strongGloss,
  corroborationRank: 1,
  romajiSpecificityRank: 0,
  senseOrder: 0,
  priorityPresenceRank: 1,
  priorityProfile: unmarked,
  glossOrder: 0,
  headwordLength: 1,
  semanticFingerprint: fingerprint,
  ...rank
})

const japanese = (fingerprint: string, rank: Partial<JapaneseRank> = {}): JapaneseRank => ({
  kind: 'japanese',
  relation: FormRelation.writtenExact,
  priorityProfile: unmarked,
  senseBreadthRank: -2,
  headwordLength: 1,
  semanticFingerprint: fingerprint,
  ...rank
})

describe('comparePresentationRanks', () => {
  test('keeps a later meaning and a mention below every first meaning', () => {
    const first = english('first')
    const later = english('later', { priorityPresenceRank: 0, senseOrder: 3 })
    const mention = english('mention', { lane: EvidenceLane.tokenGloss, priorityPresenceRank: 0 })
    expect(comparePresentationRanks(first, later)).toBeLessThan(0)
    expect(comparePresentationRanks(later, mention)).toBeLessThan(0)
  })

  test('places every later meaning alike, whichever it is', () => {
    expect(
      comparePresentationRanks(english('a', { senseOrder: 1 }), english('b', { senseOrder: 4 }))
    ).toBe(0)
  })

  test('places Japanese matches by how the form relates to the query, and after English ones', () => {
    const exact = japanese('exact')
    const prefix = japanese('prefix', { relation: FormRelation.writtenPrefix })
    expect(comparePresentationRanks(exact, prefix)).toBeLessThan(0)
    expect(comparePresentationRanks(exact, japanese('other', { headwordLength: 8 }))).toBe(0)
    expect(comparePresentationRanks(english('gloss'), exact)).toBeLessThan(0)
    expect(comparePresentationRanks(exact, english('gloss'))).toBeGreaterThan(0)
  })
})

describe('compareEnglishRanks', () => {
  test('leads with priority marks, and lets romaji that resembles the query only break ties', () => {
    const marked = english('marked', { priorityPresenceRank: 0 })
    const corroborated = english('doggu', { corroborationRank: 0 })
    const plain = english('plain')
    expect(comparePresentationRanks(corroborated, plain)).toBe(0)
    expect([plain, corroborated, marked].sort(compareEnglishRanks)).toEqual([
      marked,
      corroborated,
      plain
    ])
  })
})

describe('sameLexicalGroup', () => {
  test('groups Japanese matches by relation, priority, and sense count, whatever their length', () => {
    const first = japanese('first')
    expect(sameLexicalGroup(first, japanese('second', { headwordLength: 8 }))).toBe(true)
    expect(sameLexicalGroup(first, japanese('third', { senseBreadthRank: -1 }))).toBe(false)
    expect(sameLexicalGroup(first, english('gloss'))).toBe(false)
  })
})

describe('matchLabel', () => {
  test('names a Japanese match by its source and how the form relates to the query', () => {
    expect(matchLabel(1, japanese('a', { relation: FormRelation.readingPrefix }))).toBe(
      'source=1 japanese readingPrefix'
    )
  })

  test('names an English match by its lane and romaji, and its sense only for a strong gloss', () => {
    expect(matchLabel(0, english('a'))).toBe('source=0 english strongGloss romaji=0 sense=first')
    expect(matchLabel(0, english('a', { senseOrder: 2 }))).toBe(
      'source=0 english strongGloss romaji=0 sense=later'
    )
    expect(
      matchLabel(2, english('a', { lane: EvidenceLane.tokenGloss, romajiSpecificityRank: 3 }))
    ).toBe('source=2 english tokenGloss romaji=3')
  })
})

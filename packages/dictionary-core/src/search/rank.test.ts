import { describe, expect, test } from 'vitest'
import {
  compareEnglishRanks,
  compareJapaneseRanks,
  comparePresentationRanks,
  compareProfiles,
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

const markedProfile = { primaryMask: 2, secondaryMask: 0, newsFrequencyBand: null }

function expectEachFirst<Rank>(compare: (lhs: Rank, rhs: Rank) => number, pairs: [Rank, Rank][]) {
  for (const [first, second] of pairs) {
    expect(compare(first, second)).toBeLessThan(0)
    expect(compare(second, first)).toBeGreaterThan(0)
  }
}

describe('compareProfiles', () => {
  test('puts the form with more primary marks first when the strongest mark and news band tie', () => {
    const one = { primaryMask: 1, secondaryMask: 0, newsFrequencyBand: 3 }
    const three = { primaryMask: 1 | 2 | 4, secondaryMask: 0, newsFrequencyBand: 3 }
    expectEachFirst(compareProfiles, [[three, one]])
    expect(compareProfiles(three, { ...three })).toBe(0)
  })
})

describe('compareJapaneseRanks', () => {
  test('decides by relation, priority, sense count, headword length, then fingerprint', () => {
    const better = { priorityProfile: markedProfile, senseBreadthRank: -9, headwordLength: 0 }
    expectEachFirst(compareJapaneseRanks, [
      [japanese('z'), japanese('a', { ...better, relation: FormRelation.readingExact })],
      [japanese('z', { priorityProfile: markedProfile }), japanese('a', { senseBreadthRank: -9 })],
      [japanese('z', { senseBreadthRank: -3, headwordLength: 5 }), japanese('a')],
      [japanese('z'), japanese('a', { headwordLength: 2 })],
      [japanese('a'), japanese('b')]
    ])
  })
})

describe('compareEnglishRanks', () => {
  test('decides by lane, romaji, first sense, priority, sense, gloss, romaji support, length, fingerprint', () => {
    const token = { lane: EvidenceLane.tokenGloss }
    const romaji = { lane: EvidenceLane.romajiOnly }
    const better = { priorityPresenceRank: 0, priorityProfile: markedProfile, corroborationRank: 0 }
    expectEachFirst(compareEnglishRanks, [
      [english('z', { headwordLength: 5 }), english('a', { ...token, ...better })],
      [english('z', romaji), english('a', { ...romaji, ...better, romajiSpecificityRank: 1 })],
      [english('z'), english('a', { ...better, senseOrder: 2 })],
      [english('z', { priorityPresenceRank: 0 }), english('a', { priorityProfile: markedProfile })],
      [
        english('z', { ...token, priorityProfile: markedProfile, senseOrder: 3 }),
        english('a', token)
      ],
      [
        english('z', { ...token, senseOrder: 1, glossOrder: 5 }),
        english('a', { ...token, senseOrder: 2 })
      ],
      [english('z'), english('a', { glossOrder: 1, corroborationRank: 0, headwordLength: 0 })],
      [english('z', { corroborationRank: 0, headwordLength: 5 }), english('a')],
      [english('z'), english('a', { headwordLength: 2 })],
      [english('a'), english('b')]
    ])
  })

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

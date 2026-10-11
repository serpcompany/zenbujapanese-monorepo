import { describe, expect, test } from 'vitest'
import { composing, type SearchResultItem } from './composition'
import { FormRelation, type JapaneseRank } from './rank'

const rank = (relation: number): JapaneseRank => ({
  kind: 'japanese',
  relation,
  priorityProfile: { primaryMask: 0, secondaryMask: 0, newsFrequencyBand: null },
  senseBreadthRank: -1,
  headwordLength: 1,
  semanticFingerprint: ''
})

const item = (id: string, relation: number, matchedSummary: string | null): SearchResultItem => ({
  entry: { id, sourceRecordId: 1, headword: id, reading: id, summary: '', partsOfSpeech: [] },
  sourceOrder: 0,
  matchRank: rank(relation),
  fallbackOrder: 0,
  matchedSummary
})

describe('composing', () => {
  const primary = item('primary', FormRelation.writtenExact, 'primary match')
  const alternateA = item('alternate-a', FormRelation.readingContains, 'alternate match a')
  const alternateB = item('alternate-b', FormRelation.readingContains, 'alternate match b')

  test('numbers each source and its items in order, and keeps their match and matched meaning', () => {
    const results = composing([[primary], [alternateA, alternateB]], {
      leadingLexicalEntryCount: 1,
      usesPrimaryEntryExamples: true,
      resolution: 'deinflected'
    })
    expect(
      results.items.map(found => [found.entry.id, found.sourceOrder, found.fallbackOrder])
    ).toEqual([
      ['primary', 0, 0],
      ['alternate-a', 1, 1],
      ['alternate-b', 1, 2]
    ])
    expect(results.items.map(found => found.matchRank)).toEqual([
      primary.matchRank,
      alternateA.matchRank,
      alternateB.matchRank
    ])
    expect(results.items[2].matchedSummary).toBe('alternate match b')
    expect(results).toMatchObject({
      leadingLexicalEntryCount: 1,
      usesPrimaryEntryExamples: true,
      hasExactOrPrefixMatch: true,
      resolution: 'deinflected',
      presentation: 'ranked'
    })
  })

  test('lists an entry once, from the first source that has it, and stops at the limit', () => {
    const results = composing(
      [
        [primary, alternateA],
        [alternateA, primary, alternateB]
      ],
      {
        leadingLexicalEntryCount: 5,
        usesPrimaryEntryExamples: false
      }
    )
    expect(results.items.map(found => [found.entry.id, found.sourceOrder])).toEqual([
      ['primary', 0],
      ['alternate-a', 0],
      ['alternate-b', 1]
    ])
    expect(results.leadingLexicalEntryCount).toBe(3)
    const limited = composing([[primary], [alternateA, alternateB]], {
      leadingLexicalEntryCount: 1,
      usesPrimaryEntryExamples: false,
      limit: 2
    })
    expect(limited.items.map(found => found.entry.id)).toEqual(['primary', 'alternate-a'])
  })
})

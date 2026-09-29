import { describe, expect, test } from 'vitest'
import { frequencyChips, frequencyResults, tierForLevel, tierForRank } from './frequency'

// Expected values follow FrequencyTier, FrequencyPresentationModel, and
// SearchFrequencyRankPresentationModel in FrequencyPack.swift.

describe('tierForRank (FrequencyTier(rank:))', () => {
  test.each([
    [1, 'veryCommon'],
    [1_500, 'veryCommon'],
    [1_501, 'common'],
    [5_000, 'common'],
    [5_001, 'moderate'],
    [15_000, 'moderate'],
    [15_001, 'uncommon'],
    [30_000, 'uncommon'],
    [30_001, 'rare']
  ])('ranks %i as %s', (rank, tier) => {
    expect(tierForRank(rank)).toBe(tier)
  })
})

describe('tierForLevel (FrequencyTier(level:))', () => {
  test('reads N5 and N4 as very common, N3 and N2 as common, N1 as moderate', () => {
    expect([5, 4, 3, 2, 1].map(tierForLevel)).toEqual([
      'veryCommon',
      'veryCommon',
      'common',
      'common',
      'moderate'
    ])
  })
})

describe('frequencyResults', () => {
  test('lists each default dictionary, JLPT then YouTube', () => {
    // 要る (1546640)
    expect(
      frequencyResults([
        { pack: 'jlpt', level: 5 },
        { pack: 'tubelex', rank: 949 }
      ])
    ).toEqual([
      { source: 'JLPT', value: 'N5', tier: 'veryCommon' },
      { source: 'YouTube', value: '949', tier: 'veryCommon' }
    ])
    // 炒る (1391500): ranks are grouped as en_US numbers.
    expect(
      frequencyResults([
        { pack: 'jlpt', level: 2 },
        { pack: 'tubelex', rank: 14_572 }
      ])[1]
    ).toEqual({ source: 'YouTube', value: '14,572', tier: 'moderate' })
  })

  test('says what a dictionary lacks', () => {
    // 要 (1609600) is in neither.
    expect(frequencyResults([])).toEqual([
      { source: 'JLPT', value: 'Not listed', tier: null },
      { source: 'YouTube', value: 'No rank', tier: null }
    ])
  })
})

describe('frequencyChips', () => {
  test('shows only dictionaries that rank or list the word, since JLPT is a level list', () => {
    // 射る (1322180): YouTube only.
    expect(frequencyChips([{ pack: 'tubelex', rank: 20_940 }])).toEqual([
      { source: 'YouTube', value: '20,940', tier: 'uncommon' }
    ])
    // いる (1577980): JLPT only.
    expect(frequencyChips([{ pack: 'jlpt', level: 5 }])).toEqual([
      { source: 'JLPT', value: 'N5', tier: 'veryCommon' }
    ])
    expect(frequencyChips([])).toEqual([])
  })
})

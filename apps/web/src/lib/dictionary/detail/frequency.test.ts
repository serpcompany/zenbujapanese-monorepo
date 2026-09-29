import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  defaultFrequencyPacks,
  frequencyChips,
  frequencyResults,
  frequencyRowDetails,
  frequencyRowLabel,
  tierForLevel,
  tierForRank,
  topPercent
} from './frequency'

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
      { source: 'JLPT', value: 'N5', tier: 'veryCommon', spokenTier: null },
      { source: 'YouTube', value: '949', tier: 'veryCommon', spokenTier: 'very common' }
    ])
    // 炒る (1391500): ranks are grouped as en_US numbers.
    expect(
      frequencyResults([
        { pack: 'jlpt', level: 2 },
        { pack: 'tubelex', rank: 14_572 }
      ])[1]
    ).toEqual({
      source: 'YouTube',
      value: '14,572',
      tier: 'moderate',
      spokenTier: 'moderately common'
    })
  })

  test('says what a dictionary lacks', () => {
    // 要 (1609600) is in neither.
    expect(frequencyResults([])).toEqual([
      { source: 'JLPT', value: 'Not listed', tier: null, spokenTier: null },
      { source: 'YouTube', value: 'No rank', tier: null, spokenTier: null }
    ])
  })
})

describe('frequencyChips', () => {
  test('shows only dictionaries that rank or list the word, since JLPT is a level list', () => {
    // 射る (1322180): YouTube only.
    expect(frequencyChips([{ pack: 'tubelex', rank: 20_940 }])).toEqual([
      { source: 'YouTube', value: '20,940', tier: 'uncommon', spokenTier: 'uncommon' }
    ])
    // いる (1577980): JLPT only.
    expect(frequencyChips([{ pack: 'jlpt', level: 5 }])).toEqual([
      { source: 'JLPT', value: 'N5', tier: 'veryCommon', spokenTier: null }
    ])
    expect(frequencyChips([])).toEqual([])
  })
})

describe('frequencyRowDetails (FrequencyDisclosurePresentation)', () => {
  test('opens the JLPT level, or the rank and its percentile', () => {
    // 見る (1259290): the word-detail suite records N5, and #41 in the top 0.01%.
    const [jlpt, youtube] = frequencyRowDetails([
      { pack: 'jlpt', level: 5 },
      { pack: 'tubelex', rank: 41 }
    ])
    expect(jlpt.details).toEqual({
      pack: {
        name: 'JLPT Levels',
        domain: 'JLPT study levels (unofficial)',
        description: expect.stringContaining("Jonathan Waller's vocabulary lists"),
        version: '2025-08-26',
        source:
          'JLPT vocabulary lists by Jonathan Waller, with JMdict IDs by stephenmk (CC BY-SA 4.0)'
      },
      section: 'Level',
      rows: [{ label: 'JLPT Level', value: 'N5' }],
      explanation: null
    })
    expect(youtube.details.section).toBe('Frequency')
    expect(youtube.details.rows).toEqual([
      { label: 'Rank', value: '#41' },
      { label: 'Percentile', value: 'Top 0.01%' }
    ])
    expect(youtube.details.explanation).toBeNull()
  })

  test('explains a dictionary without the word', () => {
    const [jlpt, youtube] = frequencyRowDetails([])
    expect(jlpt.details.rows).toEqual([])
    expect(jlpt.details.explanation).toBe(
      "JLPT Levels does not list this entry. JLPT levels are study estimates from Jonathan Waller's vocabulary lists. JLPT has published no official vocabulary list since 2010."
    )
    expect(youtube.details.explanation).toBe('YouTube has no mapped frequency rank for this entry.')
  })

  test('frequencyRowLabel says each row as the app’s inlineAccessibilityLabel does', () => {
    expect(
      frequencyRowDetails([
        { pack: 'jlpt', level: 5 },
        { pack: 'tubelex', rank: 949 }
      ]).map(frequencyRowLabel)
    ).toEqual(['JLPT level N5', 'YouTube frequency rank 949, very common'])
    expect(frequencyRowDetails([]).map(frequencyRowLabel)).toEqual([
      'JLPT does not list this entry',
      'YouTube has no rank for this entry'
    ])
  })

  test('topPercent (FrequencyEvidence.topPercentDisplay) rounds to two places', () => {
    expect(topPercent(949, 351_453)).toBe('Top 0.27%')
    expect(topPercent(14_572, 351_453)).toBe('Top 4.15%')
    // Ranks are grouped as en_US numbers.
    expect(frequencyRowDetails([{ pack: 'tubelex', rank: 14_572 }])[1].details.rows[0]).toEqual({
      label: 'Rank',
      value: '#14,572'
    })
  })

  test('each pack’s disclosure is its manifest in the app’s FrequencyPackCatalog.json', () => {
    const catalog: { packs: Record<string, unknown>[] } = JSON.parse(
      readFileSync(
        new URL(
          '../../../../../ios/Modules/Sources/SearchExperience/Resources/FrequencyPackCatalog.json',
          import.meta.url
        ),
        'utf8'
      )
    )
    for (const { disclosure, coveredSourceRows } of defaultFrequencyPacks) {
      const manifest = catalog.packs.find(pack => pack.packID === disclosure.id)
      expect(manifest, disclosure.id).toBeDefined()
      expect({ ...disclosure, coveredSourceRows }).toEqual({
        id: manifest?.packID,
        name: manifest?.displayName,
        domain: manifest?.domain,
        description: manifest?.domainDescription,
        version: manifest?.packVersion,
        source: manifest?.attribution,
        coveredSourceRows: manifest?.coveredSourceRows
      })
    }
  })
})

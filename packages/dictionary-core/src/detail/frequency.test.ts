import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  defaultFrequencyPacks,
  type FrequencyDictionary,
  type FrequencyLookup,
  frequencyChips,
  frequencyFamily,
  frequencyLookupChips,
  frequencyLookupRow,
  frequencyResults,
  frequencyRowDetails,
  frequencyShortName,
  frequencySortName,
  frequencySortValue,
  frequencyTier,
  frequencyUnavailableNotice,
  tierForLevel,
  tierForRank,
  topPercent
} from './frequency'

function dictionary(
  name: string,
  kind: FrequencyDictionary['kind'] = 'rank',
  id = name
): FrequencyDictionary {
  return {
    id,
    kind,
    name,
    domain: 'Fixture',
    description: 'Fixture',
    version: '1',
    source: 'Fixture',
    coveredSourceRows: 100_000
  }
}

const unavailable = (pack: FrequencyDictionary | null, reason = 'Pack unavailable') => ({
  dictionary: pack,
  unavailable: reason
})

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
  test('lists each default dictionary, JLPT then YouTube, grouping ranks as en_US numbers', () => {
    expect(
      frequencyResults([
        { pack: 'jlpt', level: 5 },
        { pack: 'tubelex', rank: 949 }
      ])
    ).toEqual([
      { source: 'JLPT', value: 'N5', tier: 'veryCommon', spokenTier: null },
      { source: 'YouTube', value: '949', tier: 'veryCommon', spokenTier: 'very common' }
    ])
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
    expect(frequencyResults([])).toEqual([
      { source: 'JLPT', value: 'Not listed', tier: null, spokenTier: null },
      { source: 'YouTube', value: 'No rank', tier: null, spokenTier: null }
    ])
  })
})

describe('frequencyChips', () => {
  test('shows only dictionaries that rank or list the word, since JLPT is a level list', () => {
    expect(frequencyChips([{ pack: 'tubelex', rank: 20_940 }])).toEqual([
      { source: 'YouTube', value: '20,940', tier: 'uncommon', spokenTier: 'uncommon' }
    ])
    expect(frequencyChips([{ pack: 'jlpt', level: 5 }])).toEqual([
      { source: 'JLPT', value: 'N5', tier: 'veryCommon', spokenTier: null }
    ])
    expect(frequencyChips([])).toEqual([])
  })
})

describe('frequencyRowDetails (FrequencyDisclosurePresentation)', () => {
  test('opens the JLPT level, or the rank and its percentile', () => {
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

  test('a row’s label says the level, or the rank ungrouped with how common it is', () => {
    expect(
      frequencyRowDetails([
        { pack: 'jlpt', level: 5 },
        { pack: 'tubelex', rank: 14_572 }
      ]).map(row => row.label)
    ).toEqual(['JLPT level N5', 'YouTube frequency rank 14572, moderately common'])
    expect(frequencyRowDetails([]).map(row => row.label)).toEqual([
      'JLPT does not list this entry',
      'YouTube has no rank for this entry'
    ])
  })

  test('each row names its dictionary', () => {
    expect(frequencyRowDetails([]).map(row => row.pack)).toEqual([
      'zenbu.jlpt.waller.levels',
      'zenbu.tubelex.youtube.ja.unidic-3.1'
    ])
  })

  test('topPercent (FrequencyEvidence.topPercentDisplay) rounds to two places', () => {
    expect(topPercent(949, 351_453)).toBe('Top 0.27%')
    expect(topPercent(14_572, 351_453)).toBe('Top 4.15%')
  })

  test('groups a Frequency Details rank as an en_US number', () => {
    expect(frequencyRowDetails([{ pack: 'tubelex', rank: 14_572 }])[1].details.rows[0]).toEqual({
      label: 'Rank',
      value: '#14,572'
    })
  })

  test('each pack’s disclosure is its manifest in the app’s FrequencyPackCatalog.json', () => {
    const catalog: { packs: Record<string, unknown>[] } = JSON.parse(
      readFileSync(
        new URL(
          '../../../../apps/ios/Modules/Sources/SearchExperience/Resources/FrequencyPackCatalog.json',
          import.meta.url
        ),
        'utf8'
      )
    )
    for (const { pack: _, ...dictionary } of defaultFrequencyPacks) {
      const manifest = catalog.packs.find(pack => pack.packID === dictionary.id)
      expect(manifest, dictionary.id).toBeDefined()
      expect(dictionary).toEqual({
        id: manifest?.packID,
        kind: manifest?.kind ?? 'rank',
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

describe('a learner’s dictionaries', () => {
  test('a dictionary’s family is the first three parts of its ID, which its short name follows', () => {
    expect(frequencyFamily('zenbu.jiten.anime.ja.ordered-v2')).toBe('zenbu.jiten.anime')
    expect(frequencyFamily('zenbu..jlpt.waller.levels')).toBe('zenbu.jlpt.waller')
    expect(
      [
        dictionary('YouTube', 'rank', 'zenbu.tubelex.youtube.ja.unidic-3.1'),
        dictionary('Japanese Wikipedia', 'rank', 'zenbu.wikipedia.written.ja.unidic-3.1'),
        dictionary('JLPT Levels', 'level', 'zenbu.jlpt.waller.levels'),
        dictionary('Video Games', 'rank', 'zenbu.jiten.video-games.ja.ordered-v2'),
        dictionary('Anime', 'rank', 'zenbu.jiten.anime.ja.ordered-v2')
      ].map(frequencyShortName)
    ).toEqual(['YouTube', 'Wikipedia', 'JLPT', 'Games', 'Anime'])
  })

  test('Sort By names a level list by its short name and a rank list in full', () => {
    expect(frequencySortName(dictionary('JLPT Levels', 'level', 'zenbu.jlpt.waller.levels'))).toBe(
      'JLPT'
    )
    expect(
      frequencySortName(
        dictionary('Japanese Wikipedia', 'rank', 'zenbu.wikipedia.written.ja.unidic-3.1')
      )
    ).toBe('Japanese Wikipedia')
  })

  test('a rank sorts as itself and a level as its distance from N5, each with its tier', () => {
    const jlpt = dictionary('JLPT', 'level')
    const ranked = dictionary('ranked')
    const lookups: FrequencyLookup[] = [
      { dictionary: jlpt, value: 5 },
      { dictionary: jlpt, value: 1 },
      { dictionary: ranked, value: 20_000 },
      { dictionary: ranked, value: null },
      unavailable(ranked)
    ]
    expect(lookups.map(frequencySortValue)).toEqual([1, 5, 20_000, null, null])
    expect(lookups.map(frequencyTier)).toEqual(['veryCommon', 'moderate', 'uncommon', null, null])
  })

  test('a dictionary that could not be read says so, with its reason as the details', () => {
    expect(frequencyLookupRow(unavailable(dictionary('Anime')))).toMatchObject({
      pack: 'Anime',
      source: 'Anime',
      value: 'Unavailable',
      tier: null,
      label: 'Anime rank unavailable',
      details: { section: 'Frequency', rows: [], explanation: 'Pack unavailable' }
    })
    expect(frequencyLookupRow(unavailable(null, 'Frequency data unavailable'))).toMatchObject({
      pack: null,
      source: 'Frequency',
      label: 'Frequency rank unavailable',
      details: { pack: null, explanation: 'Frequency data unavailable' }
    })
  })

  test('a rank’s percentile divides by the rows its own dictionary covers', () => {
    expect(
      frequencyLookupRow({ dictionary: dictionary('Anime'), value: 1_234 }).details.rows
    ).toEqual([
      { label: 'Rank', value: '#1,234' },
      { label: 'Percentile', value: 'Top 1.23%' }
    ])
  })
})

describe('frequencyLookupChips (SearchFrequencyRankPresentationModel)', () => {
  test('the first dictionary always shows; others show only with a rank', () => {
    const shown = frequencyLookupChips([
      { dictionary: dictionary('primary'), value: null },
      { dictionary: dictionary('ranked'), value: 1_234 },
      { dictionary: dictionary('unranked'), value: null }
    ])
    expect(shown.chips.map(chip => [chip.pack, chip.source, chip.value, chip.tier])).toEqual([
      ['primary', 'primary', '—', null],
      ['ranked', 'ranked', '1,234', 'veryCommon']
    ])
    expect(shown.spoken).toBe(
      'primary has no rank for this entry, ranked frequency rank 1234, very common'
    )
  })

  test('a JLPT level reads as a level chip and is hidden when the word is not listed', () => {
    const jlpt = dictionary('JLPT', 'level')
    const listed = frequencyLookupChips([
      { dictionary: jlpt, value: 3 },
      { dictionary: dictionary('ranked'), value: 20_000 }
    ])
    expect(listed.chips.map(chip => [chip.source, chip.value, chip.tier])).toEqual([
      ['JLPT', 'N3', 'common'],
      ['ranked', '20,000', 'uncommon']
    ])
    expect(listed.spoken).toBe('JLPT level N3, ranked frequency rank 20000, uncommon')
    expect(
      frequencyLookupChips([
        { dictionary: jlpt, value: null },
        { dictionary: dictionary('ranked'), value: 12 }
      ]).chips.map(chip => chip.source)
    ).toEqual(['ranked'])
    expect(frequencyLookupChips([{ dictionary: jlpt, value: null }])).toEqual({
      chips: [],
      spoken: 'No frequency rank'
    })
  })

  test('loading and no enabled dictionary show no chips, and say which', () => {
    expect(frequencyLookupChips(null)).toEqual({ chips: [], spoken: 'Frequency rank loading' })
    expect(frequencyLookupChips([])).toEqual({
      chips: [],
      spoken: 'No frequency dictionary enabled'
    })
  })

  test('a first dictionary that could not be read shows as unavailable', () => {
    expect(frequencyLookupChips([unavailable(null, 'Frequency data unavailable')])).toEqual({
      chips: [{ pack: null, source: 'Frequency', value: '—', tier: null, spokenTier: null }],
      spoken: 'Frequency rank unavailable'
    })
  })

  test('the dictionary the list is sorted by shows first, and so shows without a rank', () => {
    const anime = dictionary('Anime', 'rank', 'zenbu.jiten.anime.ja.ordered-v2')
    const lookups: FrequencyLookup[] = [
      { dictionary: dictionary('JLPT Levels', 'level', 'zenbu.jlpt.waller.levels'), value: 5 },
      {
        dictionary: dictionary('YouTube', 'rank', 'zenbu.tubelex.youtube.ja.unidic-3.1'),
        value: 7
      },
      { dictionary: anime, value: null }
    ]
    expect(frequencyLookupChips(lookups).chips.map(chip => chip.source)).toEqual([
      'JLPT',
      'YouTube'
    ])
    expect(
      frequencyLookupChips(lookups, 'zenbu.jiten.anime').chips.map(chip => chip.source)
    ).toEqual(['Anime', 'JLPT', 'YouTube'])
  })
})

describe('frequencyUnavailableNotice (SearchFrequencyUnavailableNotice)', () => {
  const jlpt = dictionary('JLPT Levels', 'level', 'zenbu.jlpt.waller.levels')
  const youtube = dictionary('TUBELEX', 'rank', 'zenbu.tubelex.youtube.ja.unidic-3.1')
  const missing = (pack: FrequencyDictionary): FrequencyLookup => ({
    dictionary: pack,
    value: null
  })

  test('says nothing when every dictionary is available', () => {
    expect(frequencyUnavailableNotice([[missing(jlpt), missing(youtube)]])).toBeNull()
    expect(frequencyUnavailableNotice([])).toBeNull()
  })

  test('names a dictionary that failed, first or later, and says the others still order Search', () => {
    expect(frequencyUnavailableNotice([[unavailable(jlpt), missing(youtube)]])).toBe(
      'JLPT unavailable. Search is ordered by the other enabled dictionaries.'
    )
    expect(frequencyUnavailableNotice([[missing(jlpt), unavailable(youtube)]])).toBe(
      'YouTube unavailable. Search is ordered by the other enabled dictionaries.'
    )
    const anime = dictionary('Anime')
    expect(
      frequencyUnavailableNotice([
        [unavailable(jlpt), unavailable(youtube), unavailable(null), missing(anime)]
      ])
    ).toBe(
      'JLPT, YouTube, and A frequency dictionary unavailable. Search is ordered by the other enabled dictionaries.'
    )
  })

  test('claims relevance order only when every dictionary failed', () => {
    expect(frequencyUnavailableNotice([[unavailable(jlpt), unavailable(youtube)]])).toBe(
      'Frequency ordering unavailable. Showing dictionary relevance order. Pack unavailable'
    )
  })
})

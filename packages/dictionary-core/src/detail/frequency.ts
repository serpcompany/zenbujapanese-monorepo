import type { FrequencyRow } from './rows'

export type FrequencyTier = 'veryCommon' | 'common' | 'moderate' | 'uncommon' | 'rare'

export function tierForRank(rank: number): FrequencyTier {
  if (rank <= 1_500) return 'veryCommon'
  if (rank <= 5_000) return 'common'
  if (rank <= 15_000) return 'moderate'
  if (rank <= 30_000) return 'uncommon'
  return 'rare'
}

export function tierForLevel(level: number): FrequencyTier {
  if (level >= 4) return 'veryCommon'
  if (level >= 2) return 'common'
  return 'moderate'
}

export interface FrequencyPackDisclosure {
  id: string
  name: string
  domain: string
  description: string
  version: string
  source: string
}

interface FrequencyPack {
  pack: FrequencyRow['pack']
  shortName: string
  kind: 'level' | 'rank'
  disclosure: FrequencyPackDisclosure
  coveredSourceRows: number
}

export const defaultFrequencyPacks: readonly FrequencyPack[] = [
  {
    pack: 'jlpt',
    shortName: 'JLPT',
    kind: 'level',
    disclosure: {
      id: 'zenbu.jlpt.waller.levels',
      name: 'JLPT Levels',
      domain: 'JLPT study levels (unofficial)',
      description:
        "Estimated JLPT levels (N5–N1) from Jonathan Waller's vocabulary lists. JLPT has published no official vocabulary list since 2010, so levels are study estimates, not an exam syllabus.",
      version: '2025-08-26',
      source:
        'JLPT vocabulary lists by Jonathan Waller, with JMdict IDs by stephenmk (CC BY-SA 4.0)'
    },
    coveredSourceRows: 8293
  },
  {
    pack: 'tubelex',
    shortName: 'YouTube',
    kind: 'rank',
    disclosure: {
      id: 'zenbu.tubelex.youtube.ja.unidic-3.1',
      name: 'YouTube',
      domain: 'Everyday YouTube Japanese · TUBELEX',
      description:
        'Japanese used in YouTube subtitles across everyday media categories; this is media frequency, not universal Japanese frequency.',
      version: '2025.1',
      source: 'TUBELEX Japanese frequency lists by Adam Nohejl and contributors'
    },
    coveredSourceRows: 351_453
  }
]

export const levelExplanation =
  "JLPT levels are study estimates from Jonathan Waller's vocabulary lists. JLPT has published no official vocabulary list since 2010."

export interface FrequencyDetails {
  pack: Omit<FrequencyPackDisclosure, 'id'>
  section: 'Level' | 'Frequency'
  rows: { label: string; value: string }[]
  explanation: string | null
}

export interface FrequencyRowDetail extends FrequencyResult {
  details: FrequencyDetails
}

export interface FrequencyResult {
  source: string
  value: string
  tier: FrequencyTier | null
  spokenTier: string | null
}

export const tierLabels: Record<FrequencyTier, string> = {
  veryCommon: 'very common',
  common: 'common',
  moderate: 'moderately common',
  uncommon: 'uncommon',
  rare: 'rare'
}

const formatRank = new Intl.NumberFormat('en-US')

export function frequencyResults(rows: readonly FrequencyRow[]): FrequencyResult[] {
  return defaultFrequencyPacks.map(({ pack, shortName, kind }) => {
    const row = rows.find(candidate => candidate.pack === pack)
    if (row?.pack === 'jlpt') {
      const tier = tierForLevel(row.level)
      return { source: shortName, value: `N${row.level}`, tier, spokenTier: null }
    }
    if (row?.pack === 'tubelex') {
      const tier = tierForRank(row.rank)
      return {
        source: shortName,
        value: formatRank.format(row.rank),
        tier,
        spokenTier: tierLabels[tier]
      }
    }
    return {
      source: shortName,
      value: kind === 'level' ? 'Not listed' : 'No rank',
      tier: null,
      spokenTier: null
    }
  })
}

export function frequencyRowLabel(row: FrequencyResult): string {
  const kind = defaultFrequencyPacks.find(pack => pack.shortName === row.source)?.kind
  if (row.tier === null) {
    return kind === 'level'
      ? `${row.source} does not list this entry`
      : `${row.source} has no rank for this entry`
  }
  return row.spokenTier === null
    ? `${row.source} level ${row.value}`
    : `${row.source} frequency rank ${row.value}, ${row.spokenTier}`
}

export function topPercent(rank: number, coveredSourceRows: number): string {
  return `Top ${((rank / coveredSourceRows) * 100).toFixed(2)}%`
}

export function frequencyRowDetails(rows: readonly FrequencyRow[]): FrequencyRowDetail[] {
  const results = frequencyResults(rows)
  return defaultFrequencyPacks.map(({ pack, kind, disclosure, coveredSourceRows }, index) => {
    const { id: _, ...shown } = disclosure
    const row = rows.find(candidate => candidate.pack === pack)
    let details: FrequencyDetails
    if (row?.pack === 'jlpt') {
      details = {
        pack: shown,
        section: 'Level',
        rows: [{ label: 'JLPT Level', value: `N${row.level}` }],
        explanation: null
      }
    } else if (row?.pack === 'tubelex') {
      details = {
        pack: shown,
        section: 'Frequency',
        rows: [
          { label: 'Rank', value: `#${formatRank.format(row.rank)}` },
          { label: 'Percentile', value: topPercent(row.rank, coveredSourceRows) }
        ],
        explanation: null
      }
    } else {
      details = {
        pack: shown,
        section: 'Frequency',
        rows: [],
        explanation:
          kind === 'rank'
            ? `${disclosure.name} has no mapped frequency rank for this entry.`
            : `${disclosure.name} does not list this entry. ${levelExplanation}`
      }
    }
    return { ...results[index], details }
  })
}

export function frequencyChips(rows: readonly FrequencyRow[]): FrequencyResult[] {
  const [first] = defaultFrequencyPacks
  return frequencyResults(rows)
    .filter((result, index) => result.tier !== null || (index === 0 && first.kind !== 'level'))
    .map(result => (result.tier === null ? { ...result, value: '—' } : result))
}

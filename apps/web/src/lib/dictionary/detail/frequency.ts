// Ports how the app presents frequency evidence (FrequencyPack.swift): FrequencyTier,
// FrequencyPresentationModel for the word page's Frequency rows, and
// SearchFrequencyRankPresentationModel for the chips on search results. The website uses the
// app's default dictionaries only: the bundled packs, in FrequencyPackCatalog.json's order.

import type { FrequencyRow } from './rows'

/**
 * `FrequencyTier`: how common a rank is, on Migaku's star cutoffs. JLPT levels map onto the same
 * scale.
 */
export type FrequencyTier = 'veryCommon' | 'common' | 'moderate' | 'uncommon' | 'rare'

/** `FrequencyTier(rank:)`. */
export function tierForRank(rank: number): FrequencyTier {
  if (rank <= 1_500) return 'veryCommon'
  if (rank <= 5_000) return 'common'
  if (rank <= 15_000) return 'moderate'
  if (rank <= 30_000) return 'uncommon'
  return 'rare'
}

/** `FrequencyTier(level:)`: N5 and N4 very common, N3 and N2 common, N1 moderately common. */
export function tierForLevel(level: number): FrequencyTier {
  if (level >= 4) return 'veryCommon'
  if (level >= 2) return 'common'
  return 'moderate'
}

interface FrequencyPack {
  pack: FrequencyRow['pack']
  /** `FrequencyPackDisclosure.shortName`. */
  shortName: string
  kind: 'level' | 'rank'
}

/** The app's bundled packs, enabled on a new install in catalog order. */
export const defaultFrequencyPacks: readonly FrequencyPack[] = [
  { pack: 'jlpt', shortName: 'JLPT', kind: 'level' },
  { pack: 'tubelex', shortName: 'YouTube', kind: 'rank' }
]

/** One dictionary's row for a word, as `FrequencyPresentationModel` words it. */
export interface FrequencyResult {
  /** The dictionary's short name, such as YouTube. */
  source: string
  /** The rank (949), the level (N5), or what's missing (No rank, Not listed). */
  value: string
  /** Null when the dictionary has nothing for the word. */
  tier: FrequencyTier | null
  /**
   * The tier as the app's accessibility labels speak it after a rank ("YouTube frequency rank
   * 949, very common"). Null for a level, which the app reads as the level alone.
   */
  spokenTier: string | null
}

/** `FrequencyTier.label`. */
export const tierLabels: Record<FrequencyTier, string> = {
  veryCommon: 'very common',
  common: 'common',
  moderate: 'moderately common',
  uncommon: 'uncommon',
  rare: 'rare'
}

const formatRank = new Intl.NumberFormat('en-US')

/** One result per default dictionary, in order, as the word page's Frequency section lists them. */
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

/**
 * `SearchFrequencyRankPresentationModel.chips`: the first dictionary always, then each other one
 * that ranks the word. A level dictionary such as JLPT is left out when it doesn't list the word,
 * even when first.
 */
export function frequencyChips(rows: readonly FrequencyRow[]): FrequencyResult[] {
  const [first] = defaultFrequencyPacks
  return frequencyResults(rows).filter(
    (result, index) => result.tier !== null || (index === 0 && first.kind !== 'level')
  )
}

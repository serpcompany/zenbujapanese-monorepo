// Ports how the app presents frequency evidence (FrequencyPack.swift): FrequencyTier,
// FrequencyPresentationModel for the word page's Frequency rows, FrequencyDisclosurePresentation
// (WordDetailView.swift) for the Frequency Details each row opens, and
// SearchFrequencyRankPresentationModel for the chips on search results. The website uses the
// app's default dictionaries only: the bundled packs, in FrequencyPackCatalog.json's order. See
// also those files; .github/workflows/search-parity.yml makes the two sides change together, and
// the word-detail suite's `frequency` (with its `details`) checks this port against the app.

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

/**
 * `FrequencyPackDisclosure`, from the pack's manifest in FrequencyPackCatalog.json, which
 * Frequency Details shows. frequency.test.ts pins these to the catalog.
 */
export interface FrequencyPackDisclosure {
  /** `packID`. */
  id: string
  /** `displayName`. */
  name: string
  domain: string
  /** `domainDescription`. */
  description: string
  /** `packVersion`. */
  version: string
  /** `attribution`. */
  source: string
}

interface FrequencyPack {
  pack: FrequencyRow['pack']
  /** `FrequencyPackDisclosure.shortName`. */
  shortName: string
  kind: 'level' | 'rank'
  disclosure: FrequencyPackDisclosure
  /**
   * `coveredSourceRows`: the source rows the pack ranks, which a rank's percentile divides by
   * (`FrequencyEvidence.topPercentDisplay`). Every TUBELEX evidence row stores the manifest's.
   */
  coveredSourceRows: number
}

/** The app's bundled packs, enabled on a new install in catalog order. */
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

/** `FrequencyLevelEvidence.explanation`. */
export const levelExplanation =
  "JLPT levels are study estimates from Jonathan Waller's vocabulary lists. JLPT has published no official vocabulary list since 2010."

/**
 * What Frequency Details shows for one dictionary (`FrequencyDisclosurePresentation` in
 * WordDetailView.swift): the dictionary, then the word's JLPT level, or its rank and percentile,
 * or why there is neither.
 */
export interface FrequencyDetails {
  pack: Omit<FrequencyPackDisclosure, 'id'>
  /** Level for a JLPT level; otherwise Frequency. */
  section: 'Level' | 'Frequency'
  rows: { label: string; value: string }[]
  /** Shown only when there are no rows. */
  explanation: string | null
}

/** A row of the word page's Frequency section, and the details it opens. */
export interface FrequencyRowDetail extends FrequencyResult {
  details: FrequencyDetails
}

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
 * `FrequencyPresentationModel.inlineAccessibilityLabel`, without the app's "Double tap for
 * details." hint: the website's row says it opens a dialog instead.
 */
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

/** `FrequencyEvidence.topPercentDisplay`: "Top 0.27%", to two places. */
export function topPercent(rank: number, coveredSourceRows: number): string {
  return `Top ${((rank / coveredSourceRows) * 100).toFixed(2)}%`
}

/**
 * The word page's Frequency rows with what each opens, as `FrequencyDisclosurePresentation`
 * builds it from `FrequencyPresentationModel`.
 */
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

/**
 * `SearchFrequencyRankPresentationModel.chips`: the first dictionary always, then each other one
 * that ranks the word. A level dictionary such as JLPT is left out when it doesn't list the word,
 * even when first. A first dictionary without a rank reads "—" (`inlineText`).
 */
export function frequencyChips(rows: readonly FrequencyRow[]): FrequencyResult[] {
  const [first] = defaultFrequencyPacks
  return frequencyResults(rows)
    .filter((result, index) => result.tier !== null || (index === 0 && first.kind !== 'level'))
    .map(result => (result.tier === null ? { ...result, value: '—' } : result))
}

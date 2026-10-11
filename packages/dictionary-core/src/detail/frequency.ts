import type { FrequencyRow } from './rows'
import { listedWithAnd } from './text'

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

export interface FrequencyDictionary {
  id: string
  kind: 'level' | 'rank'
  name: string
  domain: string
  description: string
  version: string
  source: string
  coveredSourceRows: number
}

interface DefaultFrequencyPack extends FrequencyDictionary {
  pack: FrequencyRow['pack']
}

export const defaultFrequencyPacks: readonly DefaultFrequencyPack[] = [
  {
    pack: 'jlpt',
    id: 'zenbu.jlpt.waller.levels',
    kind: 'level',
    name: 'JLPT Levels',
    domain: 'JLPT study levels (unofficial)',
    description:
      "Estimated JLPT levels (N5–N1) from Jonathan Waller's vocabulary lists. JLPT has published no official vocabulary list since 2010, so levels are study estimates, not an exam syllabus.",
    version: '2025-08-26',
    source: 'JLPT vocabulary lists by Jonathan Waller, with JMdict IDs by stephenmk (CC BY-SA 4.0)',
    coveredSourceRows: 8293
  },
  {
    pack: 'tubelex',
    id: 'zenbu.tubelex.youtube.ja.unidic-3.1',
    kind: 'rank',
    name: 'YouTube',
    domain: 'Everyday YouTube Japanese · TUBELEX',
    description:
      'Japanese used in YouTube subtitles across everyday media categories; this is media frequency, not universal Japanese frequency.',
    version: '2025.1',
    source: 'TUBELEX Japanese frequency lists by Adam Nohejl and contributors',
    coveredSourceRows: 351_453
  }
]

export type FrequencyLookup =
  | { dictionary: FrequencyDictionary; value: number | null }
  | { dictionary: FrequencyDictionary | null; unavailable: string }

function defaultValue(pack: FrequencyRow['pack'], rows: readonly FrequencyRow[]): number | null {
  const row = rows.find(candidate => candidate.pack === pack)
  return !row ? null : row.pack === 'jlpt' ? row.level : row.rank
}

export function defaultFrequencyLookups(rows: readonly FrequencyRow[]): FrequencyLookup[] {
  return defaultFrequencyPacks.map(dictionary => ({
    dictionary,
    value: defaultValue(dictionary.pack, rows)
  }))
}

const familyShortNames = new Map([
  ['zenbu.tubelex.youtube', 'YouTube'],
  ['zenbu.wikipedia.written', 'Wikipedia'],
  ['zenbu.jlpt.waller', 'JLPT'],
  ['zenbu.jiten.video-games', 'Games']
])

export function frequencyFamily(id: string): string {
  return id
    .split('.')
    .filter(part => part !== '')
    .slice(0, 3)
    .join('.')
}

export function frequencyShortName(dictionary: Pick<FrequencyDictionary, 'id' | 'name'>): string {
  return familyShortNames.get(frequencyFamily(dictionary.id)) ?? dictionary.name
}

export function frequencySortName(dictionary: FrequencyDictionary): string {
  return dictionary.kind === 'level' ? frequencyShortName(dictionary) : dictionary.name
}

const listed = (
  lookup: FrequencyLookup
): { dictionary: FrequencyDictionary; value: number } | null =>
  'unavailable' in lookup || lookup.value === null
    ? null
    : { dictionary: lookup.dictionary, value: lookup.value }

export function frequencySortValue(lookup: FrequencyLookup): number | null {
  const found = listed(lookup)
  if (!found) return null
  return found.dictionary.kind === 'level' ? 6 - found.value : found.value
}

export function frequencyTier(lookup: FrequencyLookup): FrequencyTier | null {
  const found = listed(lookup)
  if (!found) return null
  return found.dictionary.kind === 'level' ? tierForLevel(found.value) : tierForRank(found.value)
}

const levelExplanation =
  "JLPT levels are study estimates from Jonathan Waller's vocabulary lists. JLPT has published no official vocabulary list since 2010."

type FrequencyPackDetails = Pick<
  FrequencyDictionary,
  'name' | 'domain' | 'description' | 'version' | 'source'
>

export interface FrequencyDetails {
  pack: FrequencyPackDetails
  section: 'Level' | 'Frequency'
  rows: { label: string; value: string }[]
  explanation: string | null
}

interface FrequencyLookupDetails extends Omit<FrequencyDetails, 'pack'> {
  pack: FrequencyPackDetails | null
}

export interface FrequencyResult {
  source: string
  value: string
  tier: FrequencyTier | null
  spokenTier: string | null
}

export interface FrequencyRowDetail extends FrequencyResult {
  pack: string
  label: string
  details: FrequencyDetails
}

export interface FrequencyLookupRow extends FrequencyResult {
  pack: string | null
  label: string
  details: FrequencyLookupDetails
}

export interface FrequencyChip extends FrequencyResult {
  pack: string | null
}

export const tierLabels: Record<FrequencyTier, string> = {
  veryCommon: 'very common',
  common: 'common',
  moderate: 'moderately common',
  uncommon: 'uncommon',
  rare: 'rare'
}

const formatRank = new Intl.NumberFormat('en-US')

export function levelResult(source: string, level: number): FrequencyResult {
  return { source, value: `N${level}`, tier: tierForLevel(level), spokenTier: null }
}

export function rankResult(source: string, rank: number): FrequencyResult {
  const tier = tierForRank(rank)
  return { source, value: formatRank.format(rank), tier, spokenTier: tierLabels[tier] }
}

export function topPercent(rank: number, coveredSourceRows: number): string {
  return `Top ${((rank / coveredSourceRows) * 100).toFixed(2)}%`
}

const packDetails = ({
  name,
  domain,
  description,
  version,
  source
}: FrequencyDictionary): FrequencyPackDetails => ({ name, domain, description, version, source })

function listedRow(dictionary: FrequencyDictionary, value: number | null): FrequencyRowDetail {
  const source = frequencyShortName(dictionary)
  const pack = packDetails(dictionary)
  if (value === null) {
    const isLevel = dictionary.kind === 'level'
    return {
      pack: dictionary.id,
      source,
      value: isLevel ? 'Not listed' : 'No rank',
      tier: null,
      spokenTier: null,
      label: isLevel
        ? `${source} does not list this entry`
        : `${source} has no rank for this entry`,
      details: {
        pack,
        section: 'Frequency',
        rows: [],
        explanation: isLevel
          ? `${dictionary.name} does not list this entry. ${levelExplanation}`
          : `${dictionary.name} has no mapped frequency rank for this entry.`
      }
    }
  }
  if (dictionary.kind === 'level') {
    const result = levelResult(source, value)
    return {
      pack: dictionary.id,
      ...result,
      label: `${source} level ${result.value}`,
      details: {
        pack,
        section: 'Level',
        rows: [{ label: 'JLPT Level', value: result.value }],
        explanation: null
      }
    }
  }
  const result = rankResult(source, value)
  return {
    pack: dictionary.id,
    ...result,
    label: `${source} frequency rank ${value}, ${result.spokenTier}`,
    details: {
      pack,
      section: 'Frequency',
      rows: [
        { label: 'Rank', value: `#${result.value}` },
        { label: 'Percentile', value: topPercent(value, dictionary.coveredSourceRows) }
      ],
      explanation: null
    }
  }
}

export function frequencyLookupRow(lookup: FrequencyLookup): FrequencyLookupRow {
  if (!('unavailable' in lookup)) return listedRow(lookup.dictionary, lookup.value)
  const source = lookup.dictionary ? frequencyShortName(lookup.dictionary) : 'Frequency'
  return {
    pack: lookup.dictionary?.id ?? null,
    source,
    value: 'Unavailable',
    tier: null,
    spokenTier: null,
    label: `${source} rank unavailable`,
    details: {
      pack: lookup.dictionary ? packDetails(lookup.dictionary) : null,
      section: 'Frequency',
      rows: [],
      explanation: lookup.unavailable
    }
  }
}

export function frequencyRowDetails(rows: readonly FrequencyRow[]): FrequencyRowDetail[] {
  return defaultFrequencyPacks.map(dictionary =>
    listedRow(dictionary, defaultValue(dictionary.pack, rows))
  )
}

export function frequencyResults(rows: readonly FrequencyRow[]): FrequencyResult[] {
  return frequencyRowDetails(rows).map(({ source, value, tier, spokenTier }) => ({
    source,
    value,
    tier,
    spokenTier
  }))
}

export interface FrequencyChips {
  chips: FrequencyChip[]
  spoken: string
}

export function frequencyLookupChips(
  lookups: readonly FrequencyLookup[] | null,
  leadingFamily: string | null = null
): FrequencyChips {
  if (lookups === null) return { chips: [], spoken: 'Frequency rank loading' }
  if (lookups.length === 0) return { chips: [], spoken: 'No frequency dictionary enabled' }
  const leads = (lookup: FrequencyLookup) =>
    leadingFamily !== null &&
    lookup.dictionary !== null &&
    frequencyFamily(lookup.dictionary.id) === leadingFamily
  const inOrder = [...lookups.filter(leads), ...lookups.filter(lookup => !leads(lookup))]
  const shown = inOrder.filter((lookup, offset) => {
    if (listed(lookup)) return true
    if (!('unavailable' in lookup) && lookup.dictionary.kind === 'level') return false
    return offset === 0
  })
  if (shown.length === 0) return { chips: [], spoken: 'No frequency rank' }
  const rows = shown.map(frequencyLookupRow)
  return {
    chips: rows.map(({ pack, source, value, tier, spokenTier }) => ({
      pack,
      source,
      value: tier === null ? '—' : value,
      tier,
      spokenTier
    })),
    spoken: rows.map(row => row.label).join(', ')
  }
}

export function frequencyChips(rows: readonly FrequencyRow[]): FrequencyResult[] {
  return frequencyLookupChips(defaultFrequencyLookups(rows)).chips.map(
    ({ source, value, tier, spokenTier }) => ({ source, value, tier, spokenTier })
  )
}

export function frequencyUnavailableNotice(
  entries: readonly (readonly FrequencyLookup[])[]
): string | null {
  const dictionaryCount = Math.max(0, ...entries.map(lookups => lookups.length))
  const unavailable: { dictionary: FrequencyDictionary | null; unavailable: string }[] = []
  for (let position = 0; position < dictionaryCount; position++) {
    for (const lookups of entries) {
      const lookup = lookups[position]
      if (lookup && 'unavailable' in lookup) {
        unavailable.push(lookup)
        break
      }
    }
  }
  if (unavailable.length === 0) return null
  if (unavailable.length === dictionaryCount) {
    return `Frequency ordering unavailable. Showing dictionary relevance order. ${unavailable[0].unavailable}`
  }
  const names = unavailable.map(({ dictionary }) =>
    dictionary ? frequencyShortName(dictionary) : 'A frequency dictionary'
  )
  return `${listedWithAnd(names)} unavailable. Search is ordered by the other enabled dictionaries.`
}

import { rankedLists } from '../browse/lists'
import {
  defaultFrequencyPacks,
  type FrequencyDictionary,
  type FrequencyLookup,
  frequencyShortName
} from '../detail/frequency'
import { romaji } from '../detail/romaji'
import {
  type CardRows,
  jlptChip,
  rankChip,
  type WordCard,
  type WordCardRank,
  wordCardBody
} from './card'

export interface PopupCard {
  card: WordCard
  romaji: string | null
}

const jlptPack = defaultFrequencyPacks.find(pack => pack.pack === 'jlpt')
const tubelexPack = defaultFrequencyPacks.find(pack => pack.pack === 'tubelex')

function listOf(dictionary: FrequencyDictionary) {
  return rankedLists.find(list =>
    list.source.kind === 'tubelex'
      ? dictionary.id === tubelexPack?.id
      : list.source.packId === dictionary.id
  )
}

function unavailableChip(dictionary: FrequencyDictionary): WordCardRank {
  const list = listOf(dictionary)
  return {
    list: list?.slug ?? dictionary.id,
    rank: null,
    source: list?.chip ?? frequencyShortName(dictionary),
    value: 'Unavailable',
    tier: null,
    spokenTier: null
  }
}

function rankedChip(lookup: FrequencyLookup): WordCardRank[] {
  const { dictionary } = lookup
  if (!dictionary || dictionary.kind !== 'rank') return []
  if ('unavailable' in lookup) return [unavailableChip(dictionary)]
  const list = listOf(dictionary)
  return [
    rankChip(
      list?.slug ?? dictionary.id,
      list?.chip ?? frequencyShortName(dictionary),
      lookup.value
    )
  ]
}

function jlptLevel(lookups: readonly FrequencyLookup[]): number | null {
  for (const lookup of lookups) {
    if (lookup.dictionary?.id === jlptPack?.id && 'value' in lookup) return lookup.value
  }
  return null
}

export function popupCard(
  rows: Omit<CardRows, 'frequency'>,
  lookups: readonly FrequencyLookup[]
): PopupCard {
  const level = jlptLevel(lookups)
  return {
    card: {
      ...wordCardBody(rows),
      jlpt: level === null ? null : jlptChip(level),
      frequency: lookups.flatMap(rankedChip)
    },
    romaji: romaji(rows.entry.reading)
  }
}

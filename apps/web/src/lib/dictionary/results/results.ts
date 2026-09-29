// The search results screen, as the app shows it (SearchView.swift's `SearchResultsView`): the
// retrieved results re-sorted by the default frequency dictionaries, each row's meaning and
// chips, the kanji row, the "Search for「…」" reading refinement, and the no-results state. Pure
// functions over the search core's results (../search) and each entry's frequency evidence, so
// the app-recorded search-results.json suite checks them without rendering
// (./conformance.test.ts), and the page only adds links (../data.ts).
//
// See also: apps/ios/Modules/Sources/SearchExperience/SearchView.swift and FrequencyPack.swift.
// Change the Swift and this port together, and record the suite again.

import {
  defaultFrequencyPacks,
  type FrequencyResult,
  frequencyChips,
  tierForLevel,
  tierForRank
} from '../detail/frequency'
import type { FrequencyRow } from '../detail/rows'
import { type RubySegment, rubySegments } from '../detail/ruby'
import { isKanjiCharacter } from '../detail/text'
import { normalizeQuery } from '../search/query'
import { comparePresentationRanks } from '../search/rank'
import type { SearchDatabase, SearchResultItem, SearchResults } from '../search/search'

/** Each entry's evidence in the default frequency dictionaries, by Language Reference ID. */
export type FrequencyByEntry = ReadonlyMap<string, readonly FrequencyRow[]>

/**
 * The results' frequency evidence from the search database's `entry_frequency`, in one query,
 * as `SearchFrequencyLoader` loads it for the displayed entries. Results are at most 60, under
 * D1's 100 bound parameters.
 */
export async function loadFrequency(
  db: SearchDatabase,
  results: SearchResults
): Promise<Map<string, FrequencyRow[]>> {
  const ids = [...new Set(results.items.map(item => item.entry.id))]
  if (ids.length === 0) return new Map()
  const rows = await db.all<{ entry_id: string; frequency_json: string }>(
    `SELECT entry_id, frequency_json FROM entry_frequency
     WHERE entry_id IN (${ids.map(() => '?').join(', ')})`,
    ids
  )
  return new Map(rows.map(row => [row.entry_id, JSON.parse(row.frequency_json)]))
}

/** `FrequencyTier`'s raw values: a more common tier is greater. */
const tierValue = { rare: 1, uncommon: 2, moderate: 3, common: 4, veryCommon: 5 } as const

/**
 * `FrequencyRanks`: one value per enabled dictionary, in priority order, as
 * `FrequencyLookupResult.sortValue` gives it (a rank, or a JLPT level with N5 first), or null
 * when the dictionary has nothing for the entry; with `FrequencyLookupResult.tier`.
 */
interface Ranks {
  values: (number | null)[]
  /** The tier of the first dictionary with one, as a `tierValue`; null without any. */
  tier: number | null
}

function ranks(rows: readonly FrequencyRow[]): Ranks {
  const inOrder = defaultFrequencyPacks.map(({ pack }) =>
    rows.find(candidate => candidate.pack === pack)
  )
  const values = inOrder.map(row =>
    !row ? null : row.pack === 'jlpt' ? jlptSortValue(row.level) : row.rank
  )
  const first = inOrder.find(row => row !== undefined)
  const tier = !first
    ? null
    : first.pack === 'jlpt'
      ? tierForLevel(first.level)
      : tierForRank(first.rank)
  return { values, tier: tier ? tierValue[tier] : null }
}

/** `JLPTLevel.sortValue`: learners study from N5 up, so N5 sorts first. */
const jlptSortValue = (level: number) => 6 - level

/** `DictionaryRelevance`: the item's source, then its coarse match rank. */
function compareRelevance(lhs: SearchResultItem, rhs: SearchResultItem): number {
  return lhs.sourceOrder - rhs.sourceOrder || comparePresentationRanks(lhs.matchRank, rhs.matchRank)
}

/**
 * `SearchResultFrequencyOrdering.ordered` (SearchView.swift): match evidence first; within
 * equally strong matches, the more common tier from the first dictionary that has one, then each
 * dictionary's value in priority order (lower first, a ranked entry before an unranked one), then
 * the retrieval order, then the Language Reference ID. Discovered Words keep their order.
 */
export function orderedItems(
  results: SearchResults,
  frequency: FrequencyByEntry
): SearchResultItem[] {
  if (results.presentation === 'discoveredWords') return results.items
  const ranksById = new Map(
    results.items.map(item => [item.entry.id, ranks(frequency.get(item.entry.id) ?? [])])
  )
  return [...results.items].sort((lhs, rhs) => {
    const relevance = compareRelevance(lhs, rhs)
    if (relevance !== 0) return relevance
    const left = ranksById.get(lhs.entry.id) as Ranks
    const right = ranksById.get(rhs.entry.id) as Ranks
    if (left.tier !== right.tier) {
      if (left.tier === null) return 1
      if (right.tier === null) return -1
      return right.tier - left.tier
    }
    for (let index = 0; index < Math.max(left.values.length, right.values.length); index++) {
      const lhsValue = left.values[index] ?? null
      const rhsValue = right.values[index] ?? null
      if (lhsValue !== null && rhsValue !== null && lhsValue !== rhsValue) {
        return lhsValue - rhsValue
      }
      if (lhsValue !== null && rhsValue === null) return -1
      if (lhsValue === null && rhsValue !== null) return 1
    }
    if (lhs.fallbackOrder !== rhs.fallbackOrder) return lhs.fallbackOrder - rhs.fallbackOrder
    return lhs.entry.id < rhs.entry.id ? -1 : lhs.entry.id > rhs.entry.id ? 1 : 0
  })
}

/** `ResultRow`: a word as a search result shows it. */
export interface ResultRow {
  /** The Language Reference ID. */
  id: string
  entSeq: number
  headword: string
  reading: string
  ruby: RubySegment[]
  /** `displaySummary`: the meaning an English query matched, else the entry's summary. */
  summary: string
  /** `SearchFrequencyRankPresentationModel.chips`. */
  chips: FrequencyResult[]
  /** The row's position before the re-sort. */
  retrievalOrder: number
}

/** `KanjiPrimaryRow`: the row that leads a single-kanji query's results. */
export interface KanjiRow {
  character: string
  label: 'KANJI'
  /** The primary entry's summary, or "Kanji detail" without one. */
  summary: string
  /** The primary entry's Language Reference ID. */
  entryId: string | null
}

/**
 * The list's sections, in order: `examples` ("View N Example Sentences"), the reading
 * refinement, then the words. `discoveredWords` lists a mixed-script query's first Japanese words
 * under a "Discovered Words" heading, unsorted, at most 12.
 */
export type ResultsSection = 'examples' | 'readingRefinement' | 'results' | 'discoveredWords'

/** The "View N Example Sentences" row, which opens the query's Example Sentences page. */
export interface ExamplesRow {
  title: string
  /** `SearchResultsScreen.exampleCount`: 51 means more than 50. */
  count: number
  /** The entry whose examples it opens, when not the sentences that contain the query. */
  primaryEntry: string | null
}

/** `SearchResultsScreen.exampleActionTitle`. */
export function exampleActionTitle(count: number): string {
  if (count > 50) return 'View 50+ Example Sentences'
  return `View ${count} Example ${count === 1 ? 'Sentence' : 'Sentences'}`
}

/** SearchView.swift lists at most 12 discovered words. */
export const discoveredWordLimit = 12

/** What the results screen shows for a query. */
export type SearchResultsScreen =
  | { state: 'noResults'; query: string }
  | {
      state: 'results'
      query: string
      sections: ResultsSection[]
      /** "View N Example Sentences", when any sentence matches. */
      examples: ExamplesRow | null
      /** "Search for「…」": the Japanese reading an English-looking query also spells. */
      readingRefinement: { query: string; title: string } | null
      kanji: KanjiRow | null
      rows: ResultRow[]
      /** The count VoiceOver reads ("Result 1 of N"), including the kanji row. */
      resultCount: number
    }

/** `KanjiCharacter(query.value)`: one scalar in the CJK ideograph blocks. */
export const isSingleKanji = (query: string) => isKanjiCharacter(query)

/** `LookupSearchResults.primaryEntry(for:)`: the entry written as the query, else the first. */
export function primaryItem(results: SearchResults, query: string): SearchResultItem | undefined {
  const normalized = normalizeQuery(query)
  return results.items.find(item => item.entry.headword === normalized) ?? results.items[0]
}

/**
 * `SearchResultsView` for a typed query, and SearchView.swift's no-results state, which the app
 * shows only when there are no results, no example sentences, and the query isn't one kanji.
 * `exampleCount` is the Example Sentences row's (example-search.ts's `exampleCount`).
 */
export function searchResultsScreen(
  rawQuery: string,
  results: SearchResults,
  frequency: FrequencyByEntry,
  exampleCount = 0
): SearchResultsScreen {
  const query = normalizeQuery(rawQuery)
  const singleKanji = isSingleKanji(query)
  if (results.items.length === 0 && exampleCount === 0 && !singleKanji) {
    return { state: 'noResults', query }
  }

  const sections: ResultsSection[] = []
  const examples: ExamplesRow | null =
    exampleCount > 0
      ? {
          title: exampleActionTitle(exampleCount),
          count: exampleCount,
          primaryEntry: results.usesPrimaryEntryExamples
            ? (primaryItem(results, query)?.entry.id ?? null)
            : null
        }
      : null
  if (examples) sections.push('examples')
  const readingRefinement = results.readingRefinement
    ? {
        query: results.readingRefinement,
        title: `Search for「${results.readingRefinement}」`
      }
    : null
  if (readingRefinement) sections.push('readingRefinement')

  // `SearchResultsScreen.list`: no list of words when only example sentences match.
  const discovered = results.presentation === 'discoveredWords'
  if (discovered) sections.push('discoveredWords')
  else if (singleKanji || results.items.length > 0) sections.push('results')

  const primary = singleKanji && !discovered ? primaryItem(results, query) : undefined
  const kanji: KanjiRow | null =
    singleKanji && !discovered
      ? {
          character: query,
          label: 'KANJI',
          summary: primary?.entry.summary ?? 'Kanji detail',
          entryId: primary?.entry.id ?? null
        }
      : null

  const shown = discovered
    ? results.items.slice(0, discoveredWordLimit)
    : orderedItems(results, frequency)
  const rows = shown.map(item => ({
    id: item.entry.id,
    entSeq: item.entry.sourceRecordId,
    headword: item.entry.headword,
    reading: item.entry.reading,
    ruby: rubySegments(item.entry.headword, item.entry.reading),
    summary: item.matchedSummary ?? item.entry.summary,
    chips: frequencyChips(frequency.get(item.entry.id) ?? []),
    retrievalOrder: item.fallbackOrder
  }))
  return {
    state: 'results',
    query,
    sections,
    examples,
    readingRefinement,
    kanji,
    rows,
    resultCount: rows.length + (kanji ? 1 : 0)
  }
}

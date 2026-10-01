import { frequencyByEntry, frequencyQueries } from '../artifact/frequency'
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
import { exactExampleCountLimit } from '../examples/retrieval'
import { normalizeQuery } from '../search/query'
import { comparePresentationRanks } from '../search/rank'
import type { SearchDatabase, SearchResultItem, SearchResults } from '../search/search'

export type FrequencyByEntry = ReadonlyMap<string, readonly FrequencyRow[]>

export async function loadFrequency(
  db: SearchDatabase,
  results: SearchResults
): Promise<Map<string, FrequencyRow[]>> {
  const ids = [...new Set(results.items.map(item => item.entry.id))]
  if (ids.length === 0) return new Map()
  const queries = frequencyQueries(ids)
  const [levels, ranks] = await Promise.all([
    db.all<{ id: string; level: number }>(queries.levels, queries.params),
    db.all<{ id: string; rank: number }>(queries.ranks, queries.params)
  ])
  return frequencyByEntry(levels, ranks)
}

const tierValue = { rare: 1, uncommon: 2, moderate: 3, common: 4, veryCommon: 5 } as const

interface Ranks {
  values: (number | null)[]
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

const jlptSortValue = (level: number) => 6 - level

function compareRelevance(lhs: SearchResultItem, rhs: SearchResultItem): number {
  return lhs.sourceOrder - rhs.sourceOrder || comparePresentationRanks(lhs.matchRank, rhs.matchRank)
}

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

export interface ResultRow {
  id: string
  entSeq: number
  headword: string
  reading: string
  ruby: RubySegment[]
  summary: string
  chips: FrequencyResult[]
  retrievalOrder: number
}

export interface KanjiRow {
  character: string
  label: 'KANJI'
  summary: string
  entryId: string | null
}

export type ResultsSection = 'examples' | 'readingRefinement' | 'results' | 'discoveredWords'

export interface ExamplesRow {
  title: string
  count: number
  primaryEntry: string | null
}

export function exampleActionTitle(count: number): string {
  if (count > exactExampleCountLimit) return `View ${exactExampleCountLimit}+ Example Sentences`
  return `View ${count} Example ${count === 1 ? 'Sentence' : 'Sentences'}`
}

export const discoveredWordLimit = 12

export type SearchResultsScreen =
  | { state: 'noResults'; query: string }
  | {
      state: 'results'
      query: string
      sections: ResultsSection[]
      examples: ExamplesRow | null
      readingRefinement: { query: string; title: string } | null
      kanji: KanjiRow | null
      rows: ResultRow[]
      resultCount: number
    }

export const isSingleKanji = (query: string) => isKanjiCharacter(query)

export function primaryItem(results: SearchResults, query: string): SearchResultItem | undefined {
  const normalized = normalizeQuery(query)
  return results.items.find(item => item.entry.headword === normalized) ?? results.items[0]
}

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

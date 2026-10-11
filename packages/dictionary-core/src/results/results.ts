import { frequencyByEntry, frequencyQueries } from '../artifact/frequency'
import { defaultFrequencyLookups, type FrequencyResult, frequencyChips } from '../detail/frequency'
import type { FrequencyRow } from '../detail/rows'
import { type RubySegment, rubySegments } from '../detail/ruby'
import { graphemeCount, isKanjiCharacter } from '../detail/text'
import { exactExampleCountLimit } from '../examples/retrieval'
import { normalizeQuery } from '../search/query'
import { comparePresentationRanks } from '../search/rank'
import type { SearchDatabase, SearchResultItem, SearchResults } from '../search/search'
import { orderedByFrequency } from './ordering'

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

function compareRelevance(lhs: SearchResultItem, rhs: SearchResultItem): number {
  return lhs.sourceOrder - rhs.sourceOrder || comparePresentationRanks(lhs.matchRank, rhs.matchRank)
}

export interface ListedItem {
  id: string
  entSeq: number
  headword: string
  reading: string
  entrySummary: string
  matchedSummary: string | null
  relevance: number
  fallbackOrder: number
}

export interface ListedResults {
  items: ListedItem[]
  presentation: SearchResults['presentation']
  readingRefinement: string | null
  usesPrimaryEntryExamples: boolean
  leadingLexicalEntryCount: number
}

export function listedResults(results: SearchResults): ListedResults {
  const byRelevance = [...results.items].sort(compareRelevance)
  const relevance = new Map<string, number>()
  let rank = 0
  for (const [index, item] of byRelevance.entries()) {
    if (index > 0 && compareRelevance(byRelevance[index - 1], item) !== 0) rank += 1
    relevance.set(item.entry.id, rank)
  }
  return {
    items: results.items.map(item => ({
      id: item.entry.id,
      entSeq: item.entry.sourceRecordId,
      headword: item.entry.headword,
      reading: item.entry.reading,
      entrySummary: item.entry.summary,
      matchedSummary: item.matchedSummary,
      relevance: relevance.get(item.entry.id) ?? 0,
      fallbackOrder: item.fallbackOrder
    })),
    presentation: results.presentation,
    readingRefinement: results.readingRefinement,
    usesPrimaryEntryExamples: results.usesPrimaryEntryExamples,
    leadingLexicalEntryCount: results.leadingLexicalEntryCount
  }
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

function exampleActionTitle(count: number): string {
  if (count > exactExampleCountLimit) return `View ${exactExampleCountLimit}+ Example Sentences`
  return `View ${count} Example ${count === 1 ? 'Sentence' : 'Sentences'}`
}

const discoveredWordLimit = 12

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

const primary = <Item>(items: readonly Item[], headword: (item: Item) => string, query: string) =>
  items.find(item => headword(item) === query) ?? items[0]

export function primaryItem(results: SearchResults, query: string): SearchResultItem | undefined {
  return primary(results.items, item => item.entry.headword, normalizeQuery(query))
}

export interface ResultsLayout {
  query: string
  isEmpty: boolean
  sections: ResultsSection[]
  examples: { title: string; count: number } | null
  readingRefinement: { query: string; title: string } | null
  kanji: KanjiRow | null
  primary: ListedItem | undefined
  presented: ListedItem[]
  isDiscovered: boolean
}

export function resultsLayout(
  rawQuery: string,
  results: ListedResults,
  exampleCount: number,
  fromRadicals = false
): ResultsLayout {
  const query = normalizeQuery(rawQuery)
  const leadingOnly = fromRadicals && graphemeCount(query) === 1
  const singleKanji = isKanjiCharacter(query)
  const isDiscovered = results.presentation === 'discoveredWords'
  const found = primary(results.items, item => item.headword, query)
  const sections: ResultsSection[] = []
  const examples =
    exampleCount > 0 ? { title: exampleActionTitle(exampleCount), count: exampleCount } : null
  if (examples) sections.push('examples')
  const readingRefinement = results.readingRefinement
    ? { query: results.readingRefinement, title: `Search for「${results.readingRefinement}」` }
    : null
  if (readingRefinement) sections.push('readingRefinement')
  if (isDiscovered) sections.push('discoveredWords')
  else if (singleKanji || results.items.length > 0) sections.push('results')
  const presented = isDiscovered
    ? results.items.slice(0, discoveredWordLimit)
    : leadingOnly
      ? results.items.slice(0, Math.min(results.leadingLexicalEntryCount, results.items.length))
      : results.items
  return {
    query,
    isEmpty: results.items.length === 0 && exampleCount === 0 && !singleKanji,
    sections,
    examples,
    readingRefinement,
    kanji:
      singleKanji && !isDiscovered
        ? {
            character: query,
            label: 'KANJI',
            summary: found?.entrySummary ?? 'Kanji detail',
            entryId: found?.id ?? null
          }
        : null,
    primary: found,
    presented,
    isDiscovered
  }
}

export function searchResultsScreen(
  rawQuery: string,
  results: SearchResults,
  frequency: FrequencyByEntry,
  exampleCount = 0
): SearchResultsScreen {
  const layout = resultsLayout(rawQuery, listedResults(results), exampleCount)
  if (layout.isEmpty) return { state: 'noResults', query: layout.query }
  const shown = layout.isDiscovered
    ? layout.presented
    : orderedByFrequency(layout.presented, id => defaultFrequencyLookups(frequency.get(id) ?? []))
  const rows = shown.map(item => ({
    id: item.id,
    entSeq: item.entSeq,
    headword: item.headword,
    reading: item.reading,
    ruby: rubySegments(item.headword, item.reading),
    summary: item.matchedSummary ?? item.entrySummary,
    chips: frequencyChips(frequency.get(item.id) ?? []),
    retrievalOrder: item.fallbackOrder
  }))
  return {
    state: 'results',
    query: layout.query,
    sections: layout.sections,
    examples: layout.examples && {
      ...layout.examples,
      primaryEntry: results.usesPrimaryEntryExamples ? (layout.primary?.id ?? null) : null
    },
    readingRefinement: layout.readingRefinement,
    kanji: layout.kanji,
    rows,
    resultCount: rows.length + (layout.kanji ? 1 : 0)
  }
}

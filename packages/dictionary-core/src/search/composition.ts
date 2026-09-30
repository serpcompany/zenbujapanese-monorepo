import type { SearchEntry } from './database'
import { FormRelation, type Rank } from './rank'
import type { RankedEntry } from './ranked-entries'

export interface SearchResultItem {
  entry: SearchEntry
  sourceOrder: number
  matchRank: Rank
  fallbackOrder: number
  matchedSummary: string | null
}

export interface SearchResults {
  items: SearchResultItem[]
  leadingLexicalEntryCount: number
  presentation: 'ranked' | 'discoveredWords'
  resolution: 'direct' | 'deinflected' | 'analyzed'
  readingRefinement: string | null
  usesPrimaryEntryExamples: boolean
  hasExactOrPrefixMatch: boolean
}

export const searchResultLimit = 60

export function noResults(): SearchResults {
  return {
    items: [],
    leadingLexicalEntryCount: 0,
    presentation: 'ranked',
    resolution: 'direct',
    readingRefinement: null,
    usesPrimaryEntryExamples: false,
    hasExactOrPrefixMatch: false
  }
}

export function resultItems(ranked: RankedEntry[]): SearchResultItem[] {
  return ranked.map((entry, fallbackOrder) => ({
    entry: entry.entry,
    sourceOrder: 0,
    matchRank: entry.presentationRank,
    fallbackOrder,
    matchedSummary: entry.matchedSummary
  }))
}

export function leadingExactFormCount(items: readonly SearchResultItem[]): number {
  let count = 0
  for (const item of items) {
    if (item.matchRank.kind !== 'japanese') break
    if (item.matchRank.relation > FormRelation.readingExact) break
    count++
  }
  return count
}

export function composing(
  sources: SearchResultItem[][],
  options: {
    leadingLexicalEntryCount: number
    usesPrimaryEntryExamples: boolean
    hasExactOrPrefixMatch?: boolean
    resolution?: SearchResults['resolution']
    limit?: number
  }
): SearchResults {
  const limit = options.limit ?? searchResultLimit
  const items: SearchResultItem[] = []
  const seen = new Set<string>()
  compose: for (const [sourceOrder, source] of sources.entries()) {
    for (const item of source) {
      if (seen.has(item.entry.id)) continue
      seen.add(item.entry.id)
      items.push({ ...item, sourceOrder, fallbackOrder: items.length })
      if (items.length === limit) break compose
    }
  }
  return {
    ...noResults(),
    items,
    leadingLexicalEntryCount: Math.min(options.leadingLexicalEntryCount, items.length),
    resolution: options.resolution ?? 'direct',
    usesPrimaryEntryExamples: options.usesPrimaryEntryExamples,
    hasExactOrPrefixMatch: options.hasExactOrPrefixMatch ?? true
  }
}

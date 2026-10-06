import {
  composing,
  leadingExactFormCount,
  noResults,
  resultItems,
  type SearchResultItem,
  type SearchResults,
  searchResultLimit
} from './composition'
import { type SearchDatabase, withParametersTruncatedAtNul } from './database'
import { acceptsPartsOfSpeech, deinflect } from './deinflect'
import { rankedEnglish } from './english'
import { hasFormContaining, rankedJapanese, rankedJapaneseForms } from './japanese'
import { lookupSegments, type MorphologyAnalyzer, type MorphologyWord } from './morphology'
import {
  isASCII,
  isJapaneseOnly,
  isMixedScript,
  japaneseSegments,
  literalQuery,
  normalizeQuery,
  romajiDeinflectedCandidates
} from './query'
import { sameLexicalGroup } from './rank'
import type { RankedEntry } from './ranked-entries'

export type { SearchResultItem, SearchResults } from './composition'
export type { SearchDatabase, SearchEntry } from './database'
export type { JapaneseRow } from './japanese'
export { rankJapanese } from './japanese'
export type { MorphologyAnalyzer } from './morphology'

export interface SearchCapabilities {
  morphology?: MorphologyAnalyzer
}

export interface SearchFeatures {
  sentenceSearch: boolean
}

function searchFeatures(capabilities: SearchCapabilities): SearchFeatures {
  return { sentenceSearch: capabilities.morphology !== undefined }
}

export class DictionarySearch {
  readonly features: SearchFeatures
  private readonly db: SearchDatabase

  constructor(
    db: SearchDatabase,
    private readonly capabilities: SearchCapabilities = {}
  ) {
    this.db = withParametersTruncatedAtNul(db)
    this.features = searchFeatures(capabilities)
  }

  async search(rawQuery: string): Promise<SearchResults> {
    const query = normalizeQuery(rawQuery)
    const exactFormEntry =
      isASCII(query) && query !== ''
        ? (await rankedEnglish(this.db, query, true))[0]?.entry
        : undefined
    if (exactFormEntry) {
      const refinement = normalizeQuery(exactFormEntry.reading)
      const [hasRefinedResults, literalResults] = await Promise.all([
        this.hasResults(refinement),
        this.searchOnce(literalQuery(query))
      ])
      if (hasRefinedResults && literalResults.items.length > 0) {
        const usesPrimaryEntryExamples =
          literalResults.usesPrimaryEntryExamples ||
          literalResults.items.some(item => item.entry.id === exactFormEntry.id)
        return { ...literalResults, usesPrimaryEntryExamples, readingRefinement: refinement }
      }
    }

    const directResults = await this.searchOnce(query)
    const romajiCandidates = romajiDeinflectedCandidates(query)
    if (!directResults.hasExactOrPrefixMatch && romajiCandidates.length > 0) {
      const deinflectedResults = await Promise.all(
        romajiCandidates.map(candidate => this.searchOnce(candidate))
      )
      const primaryIndex = deinflectedResults.findIndex(results => results.items.length > 0)
      if (primaryIndex >= 0) {
        const primary = deinflectedResults[primaryIndex]
        const primaryItems = primary.items.slice(0, primary.leadingLexicalEntryCount)
        return composing(
          [
            primaryItems,
            ...deinflectedResults.slice(primaryIndex + 1).map(results => results.items),
            directResults.items
          ],
          {
            leadingLexicalEntryCount: primaryItems.length,
            usesPrimaryEntryExamples: true,
            resolution: 'deinflected'
          }
        )
      }
    }

    if (isJapaneseOnly(query)) {
      const deinflectedSources = await this.japaneseDeinflectedSources(query)
      if (deinflectedSources.length > 0) {
        const exactCount = leadingExactFormCount(directResults.items)
        if (exactCount > 0) {
          return composing(
            [
              directResults.items.slice(0, exactCount),
              ...deinflectedSources,
              directResults.items.slice(exactCount)
            ],
            {
              leadingLexicalEntryCount: directResults.leadingLexicalEntryCount,
              usesPrimaryEntryExamples: directResults.usesPrimaryEntryExamples,
              hasExactOrPrefixMatch: directResults.hasExactOrPrefixMatch
            }
          )
        }
        return composing([...deinflectedSources, directResults.items], {
          leadingLexicalEntryCount: deinflectedSources[0].length,
          usesPrimaryEntryExamples: true,
          resolution: 'deinflected'
        })
      }
    }

    if (exactFormEntry && directResults.items.some(item => item.entry.id === exactFormEntry.id)) {
      return { ...directResults, usesPrimaryEntryExamples: true }
    }
    if (directResults.items.length > 0) return directResults

    const analyzed = await this.analyzedItems(query)
    if (analyzed.length > 1 || (isMixedScript(query) && analyzed.length > 0)) {
      return {
        ...composing(
          analyzed.map(item => [item]),
          {
            leadingLexicalEntryCount: analyzed.length,
            usesPrimaryEntryExamples: false,
            hasExactOrPrefixMatch: false,
            resolution: 'analyzed',
            limit: analyzed.length
          }
        ),
        presentation: 'discoveredWords'
      }
    }
    if (isMixedScript(query)) {
      for (const segment of japaneseSegments(query)) {
        const results = await this.searchOnce(segment)
        if (results.items.length > 0) {
          return { ...results, presentation: 'discoveredWords', hasExactOrPrefixMatch: false }
        }
      }
    }
    return noResults()
  }

  private async searchOnce(query: string): Promise<SearchResults> {
    if (query === '') return noResults()
    const ranked = isASCII(query)
      ? await rankedEnglish(this.db, query)
      : await rankedJapanese(this.db, query)
    if (ranked.length === 0) return noResults()
    let leadingLexicalEntryCount = 0
    while (
      leadingLexicalEntryCount < ranked.length &&
      sameLexicalGroup(ranked[leadingLexicalEntryCount].rank, ranked[0].rank)
    ) {
      leadingLexicalEntryCount++
    }
    return {
      ...noResults(),
      items: resultItems(ranked.slice(0, searchResultLimit)),
      leadingLexicalEntryCount: Math.min(leadingLexicalEntryCount, searchResultLimit),
      hasExactOrPrefixMatch: ranked.some(entry => entry.hasExactOrPrefixMatch)
    }
  }

  private async hasResults(query: string): Promise<boolean> {
    if (query === '') return false
    if (isASCII(query)) return (await this.searchOnce(query)).items.length > 0
    return hasFormContaining(this.db, query)
  }

  private async analyzedItems(query: string): Promise<SearchResultItem[]> {
    const morphology = this.capabilities.morphology
    if (!morphology || query === '') return []
    let words: MorphologyWord[]
    try {
      words = await morphology.analyze(query)
    } catch {
      return []
    }
    const segments = lookupSegments(words)
    const results = await Promise.all(segments.map(segment => this.searchOnce(segment)))
    return results.flatMap(({ items }, index) => {
      const item = items.find(candidate => candidate.entry.headword === segments[index]) ?? items[0]
      return item ? [item] : []
    })
  }

  private async japaneseDeinflectedSources(query: string): Promise<SearchResultItem[][]> {
    const candidates = deinflect(query).map(candidate => ({
      ...candidate,
      term: normalizeQuery(candidate.term)
    }))
    const matchesByTerm = await rankedJapaneseForms(
      this.db,
      candidates.map(candidate => candidate.term)
    )
    const sourcesByDepth = new Map<number, RankedEntry[]>()
    const seen = new Set<string>()
    for (const candidate of candidates) {
      const matches = (matchesByTerm.get(candidate.term) ?? []).filter(ranked =>
        candidate.wordClasses.some(wordClass =>
          acceptsPartsOfSpeech(wordClass, ranked.entry.partsOfSpeech)
        )
      )
      for (const match of matches) {
        if (seen.has(match.entry.id)) continue
        seen.add(match.entry.id)
        const source = sourcesByDepth.get(candidate.depth) ?? []
        source.push(match)
        sourcesByDepth.set(candidate.depth, source)
      }
    }
    return [...sourcesByDepth.keys()]
      .sort((lhs, rhs) => lhs - rhs)
      .map(depth => resultItems(sourcesByDepth.get(depth) ?? []))
  }
}

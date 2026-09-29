// Where the search results page's rows go, added to the results screen (./results.ts), and how the
// page splits its words into pages. Shared by data.ts's `searchDictionary`, the rows route, and the
// rendered-page test, so the test renders the page's real links.

import { fixtureWordRows } from '@/lib/dictionary/fixtures'
import { hasSearchPath, kanjiPath, searchExamplesPath, searchPath, wordPath } from '../urls'
import type { ExamplesRow, KanjiRow, ResultRow, SearchResultsScreen } from './results'

/** With the page it links to; null when it has no page yet. */
type Linked<T> = T & { path: string | null }

/** A search result; `path` is null when the word has no page yet (#465). */
export type SearchWord = Linked<ResultRow>

/**
 * How many words the results page renders, and loads at a time as it scrolls, up to the app's 60
 * (#466: about 25 in the page, then load more).
 */
export const resultsPerPage = 25

/** The search results screen, with where each row goes. */
export type SearchData =
  | Extract<SearchResultsScreen, { state: 'noResults' }>
  | (Omit<
      Extract<SearchResultsScreen, { state: 'results' }>,
      'rows' | 'kanji' | 'readingRefinement' | 'examples'
    > & {
      /** The first `resultsPerPage` words; the rest load from `rowsPath`. */
      rows: SearchWord[]
      /** How many words the search lists, at most 60. */
      wordCount: number
      /** Where the page loads its next words, for its search build; null when it shows them all. */
      rowsPath: string | null
      /** Null path when the kanji has no page. */
      kanji: Linked<KanjiRow> | null
      readingRefinement: Linked<{ query: string; title: string }> | null
      examples: Linked<ExamplesRow> | null
    })

/** Before the dictionary database is loaded, only fixture words have pages. */
const fixtureWordPaths = new Map(
  fixtureWordRows.map(({ entry }) => [entry.entSeq, wordPath(entry)])
)

export interface SearchLinks {
  /** Whether the dictionary database holds an import, so every word has a page. */
  dictionaryLoaded: boolean
  /** Whether the query's kanji, for a one-kanji query, has a kanji page. */
  kanjiHasPage: boolean
  /** The search database's build, which names the rows route; null renders every row. */
  build: string | null
}

/** Every word of the screen with where it goes. */
export function linkedWords(screen: SearchResultsScreen, dictionaryLoaded: boolean): SearchWord[] {
  if (screen.state === 'noResults') return []
  return screen.rows.map(row => ({
    ...row,
    path: dictionaryLoaded ? wordPath(row) : (fixtureWordPaths.get(row.entSeq) ?? null)
  }))
}

/**
 * Where the results page loads more words: its search, the build it came from, and (added by the
 * page) the first position it needs.
 */
export const searchRowsPath = (query: string, build: string) =>
  `${searchPath(query)}results.json?build=${encodeURIComponent(build)}`

export function linkSearchScreen(screen: SearchResultsScreen, links: SearchLinks): SearchData {
  if (screen.state === 'noResults') return screen
  const refinement = screen.readingRefinement
  const words = linkedWords(screen, links.dictionaryLoaded)
  const paged = links.build !== null && words.length > resultsPerPage
  return {
    ...screen,
    kanji: screen.kanji
      ? {
          ...screen.kanji,
          path: links.kanjiHasPage ? kanjiPath(screen.kanji.character) : null
        }
      : null,
    readingRefinement: refinement
      ? {
          ...refinement,
          path: hasSearchPath(refinement.query) ? searchPath(refinement.query) : null
        }
      : null,
    examples: screen.examples
      ? {
          ...screen.examples,
          path: hasSearchPath(screen.query) ? searchExamplesPath(screen.query) : null
        }
      : null,
    rows: paged ? words.slice(0, resultsPerPage) : words,
    wordCount: words.length,
    rowsPath: paged && links.build !== null ? searchRowsPath(screen.query, links.build) : null
  }
}

/**
 * Whether search engines may index a results page: it lists a word, or its kanji row opens a
 * kanji page. A one-kanji query with neither shows only a "Kanji detail" row, an empty page.
 */
export function isIndexable(data: SearchData): boolean {
  return data.state === 'results' && (data.wordCount > 0 || data.kanji?.path != null)
}

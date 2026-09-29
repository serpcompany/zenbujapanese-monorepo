// Where the search results page's rows go, added to the results screen (./results.ts). Shared by
// data.ts's `searchDictionary` and the rendered-page test, so the test renders the page's real
// links.

import { fixtureWordRows } from '@zenbu/dictionary-core/fixtures'
import type {
  KanjiRow,
  ResultRow,
  SearchResultsScreen
} from '@zenbu/dictionary-core/results/results'
import { hasSearchPath, kanjiPath, searchPath, wordPath } from '../urls'

/** With the page it links to; null when it has no page yet. */
type Linked<T> = T & { path: string | null }

/** A search result; `path` is null when the word has no page yet (#465). */
export type SearchWord = Linked<ResultRow>

/** The search results screen, with where each row goes. */
export type SearchData =
  | Extract<SearchResultsScreen, { state: 'noResults' }>
  | (Omit<
      Extract<SearchResultsScreen, { state: 'results' }>,
      'rows' | 'kanji' | 'readingRefinement'
    > & {
      rows: SearchWord[]
      /** Null path when the kanji has no page. */
      kanji: Linked<KanjiRow> | null
      readingRefinement: Linked<{ query: string; title: string }> | null
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
}

export function linkSearchScreen(screen: SearchResultsScreen, links: SearchLinks): SearchData {
  if (screen.state === 'noResults') return screen
  const refinement = screen.readingRefinement
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
    rows: screen.rows.map(row => ({
      ...row,
      path: links.dictionaryLoaded ? wordPath(row) : (fixtureWordPaths.get(row.entSeq) ?? null)
    }))
  }
}

/**
 * Whether search engines may index a results page: it lists a word, or its kanji row opens a
 * kanji page. A one-kanji query with neither shows only a "Kanji detail" row, an empty page.
 */
export function isIndexable(data: SearchData): boolean {
  return data.state === 'results' && (data.rows.length > 0 || data.kanji?.path != null)
}

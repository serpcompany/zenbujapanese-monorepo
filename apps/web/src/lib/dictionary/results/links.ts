import { fixtureWordRows } from '@zenbu/dictionary-core/fixtures'
import type {
  ExamplesRow,
  KanjiRow,
  ResultRow,
  SearchResultsScreen
} from '@zenbu/dictionary-core/results/results'
import { isASCII, normalizeQuery } from '@zenbu/dictionary-core/search/query'
import type { KanjiDetailsData } from '../data'
import { hasSearchPath, searchPath, wordPath } from '../urls'

type Linked<T> = T & { path: string | null }

export type SearchWord = Linked<ResultRow>

export type SearchExamplesTarget = { kind: 'word'; path: string } | { kind: 'inline' }

export type SearchData =
  | Extract<SearchResultsScreen, { state: 'noResults' }>
  | (Omit<
      Extract<SearchResultsScreen, { state: 'results' }>,
      'rows' | 'kanji' | 'readingRefinement' | 'examples'
    > & {
      examples: (ExamplesRow & { target: SearchExamplesTarget }) | null
      rows: SearchWord[]
      kanji: (KanjiRow & { details: KanjiDetailsData | null }) | null
      readingRefinement: Linked<{ query: string; title: string }> | null
    })

const fixtureWordPaths = new Map(
  fixtureWordRows.map(({ entry }) => [entry.entSeq, wordPath(entry)])
)

export interface SearchLinks {
  dictionaryLoaded: boolean
  kanji: KanjiDetailsData | null
}

export const wordExamplesAnchor = 'examples'

function examplesTarget(
  query: string,
  examples: ExamplesRow,
  rows: readonly SearchWord[]
): SearchExamplesTarget {
  const primary = examples.primaryEntry
    ? rows.find(row => row.id === examples.primaryEntry)
    : undefined
  const word = primary ?? (isASCII(normalizeQuery(query)) ? undefined : rows[0])
  return word?.path
    ? { kind: 'word', path: `${word.path}#${wordExamplesAnchor}` }
    : { kind: 'inline' }
}

export function linkSearchScreen(screen: SearchResultsScreen, links: SearchLinks): SearchData {
  if (screen.state === 'noResults') return screen
  const refinement = screen.readingRefinement
  const rows = screen.rows.map(row => ({
    ...row,
    path: links.dictionaryLoaded ? wordPath(row) : (fixtureWordPaths.get(row.entSeq) ?? null)
  }))
  return {
    ...screen,
    examples: screen.examples
      ? { ...screen.examples, target: examplesTarget(screen.query, screen.examples, rows) }
      : null,
    kanji: screen.kanji ? { ...screen.kanji, details: links.kanji } : null,
    readingRefinement: refinement
      ? {
          ...refinement,
          path: hasSearchPath(refinement.query) ? searchPath(refinement.query) : null
        }
      : null,
    rows
  }
}

function kanjiHasContent(details: KanjiDetailsData | null | undefined): boolean {
  return details != null && (details.meanings.length > 0 || details.readings.length > 0)
}

export function isIndexable(data: SearchData): boolean {
  return data.state === 'results' && (data.rows.length > 0 || kanjiHasContent(data.kanji?.details))
}

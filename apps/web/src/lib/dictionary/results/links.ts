import { fixtureWordRows } from '@zenbu/dictionary-core/fixtures'
import type {
  ExamplesRow,
  KanjiRow,
  ResultRow,
  SearchResultsScreen
} from '@zenbu/dictionary-core/results/results'
import { hasSearchPath, kanjiPath, searchExamplesPath, searchPath, wordPath } from '../urls'

type Linked<T> = T & { path: string | null }

export type SearchWord = Linked<ResultRow>

export type SearchData =
  | Extract<SearchResultsScreen, { state: 'noResults' }>
  | (Omit<
      Extract<SearchResultsScreen, { state: 'results' }>,
      'rows' | 'kanji' | 'readingRefinement' | 'examples'
    > & {
      examples: Linked<ExamplesRow> | null
      rows: SearchWord[]
      kanji: Linked<KanjiRow> | null
      readingRefinement: Linked<{ query: string; title: string }> | null
    })

const fixtureWordPaths = new Map(
  fixtureWordRows.map(({ entry }) => [entry.entSeq, wordPath(entry)])
)

export interface SearchLinks {
  dictionaryLoaded: boolean
  kanjiHasPage: boolean
}

export function linkSearchScreen(screen: SearchResultsScreen, links: SearchLinks): SearchData {
  if (screen.state === 'noResults') return screen
  const refinement = screen.readingRefinement
  return {
    ...screen,
    examples: screen.examples
      ? {
          ...screen.examples,
          path: hasSearchPath(screen.query) ? searchExamplesPath(screen.query) : null
        }
      : null,
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

export function isIndexable(data: SearchData): boolean {
  return data.state === 'results' && (data.rows.length > 0 || data.kanji?.path != null)
}

import { normalizeQuery } from '@zenbu/dictionary-core/search/query'
import {
  DictionarySearch,
  type SearchCapabilities,
  type SearchDatabase,
  type SearchResults
} from '@zenbu/dictionary-core/search/search'

/**
 * The capabilities the website supplies: none. Sentence search needs the app's Japanese
 * analyzer, Sudachi, whose 217 MB dictionary is more than a Worker's 128 MB of memory, so the
 * website leaves it off and is a glossary of words and kanji (ADR 0008).
 */
export const websiteCapabilities: SearchCapabilities = {}

/** The search core's database access, on D1. */
export function d1SearchDatabase(db: D1Database): SearchDatabase {
  return {
    async all<Row>(sql: string, params: readonly (string | number)[]) {
      const { results } = await db
        .prepare(sql)
        .bind(...params)
        .all<Row>()
      return results
    }
  }
}

export interface WebsiteSearch {
  search(rawQuery: string): Promise<SearchResults>
}

// The precomputed queries, read once per isolate: 281 short strings.
const cachedQueries = new WeakMap<D1Database, Promise<Set<string>>>()

/**
 * Search on the search database (SEARCH_DB). Broad queries, which read too many rows to run on
 * D1 per request, answer from `search_cache`, precomputed by the import with this same core
 * (scripts/release-d1/search/precompute.mts). Every other query runs the core.
 */
export function websiteSearch(db: D1Database): WebsiteSearch {
  const core = new DictionarySearch(d1SearchDatabase(db), websiteCapabilities)
  return {
    async search(rawQuery) {
      let keys = cachedQueries.get(db)
      if (!keys) {
        keys = db
          .prepare('SELECT query FROM search_cache')
          .all<{ query: string }>()
          .then(({ results }) => new Set(results.map(row => row.query)))
        keys.catch(() => cachedQueries.delete(db))
        cachedQueries.set(db, keys)
      }
      const query = normalizeQuery(rawQuery)
      if ((await keys).has(query)) {
        const hit = await db
          .prepare('SELECT results FROM search_cache WHERE query = ?')
          .bind(query)
          .first<{ results: string }>()
        if (hit) return JSON.parse(hit.results)
      }
      return core.search(rawQuery)
    }
  }
}

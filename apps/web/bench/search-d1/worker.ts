// A throwaway Worker for the search benchmark (.github/workflows/search-d1-benchmark.yml). It
// runs the website's search core against a D1 loaded with the search tables and reports how
// long each request spent in the Worker and in D1. Never deployed with the site.
//
// Options, so one run compares them: `cache=1` answers a query from `search_cache` when the
// build precomputed it (scripts/release-d1/search/precompute.mts); `db=search` searches a second
// copy of the tables, so searches and word pages don't share a database.
import { normalizeQuery } from '@zenbu/dictionary-core/search/query'
import {
  DictionarySearch,
  type SearchDatabase,
  type SearchResults
} from '@zenbu/dictionary-core/search/search'
import { websiteCapabilities } from '../../src/lib/dictionary/search/website'

interface Env {
  DB: D1Database
  /** A second copy of the tables, for searches only. Absent in local runs. */
  DB_SEARCH?: D1Database
  /** "on" reads through a D1 session, so reads may go to a replica. */
  READ_REPLICATION: string
}

type Queryable = Pick<D1Database, 'prepare'>

interface Measurement {
  queries: number
  sqlMs: number
  rowsRead: number
  regions: Set<string>
}

/** A SearchDatabase that also totals D1's own timings for every statement. */
function measuredDatabase(db: Queryable, measurement: Measurement): SearchDatabase {
  return {
    async all<Row>(sql: string, params: readonly (string | number)[]) {
      const { results, meta } = await db
        .prepare(sql)
        .bind(...params)
        .all<Row>()
      measurement.queries += 1
      measurement.sqlMs += meta.timings?.sql_duration_ms ?? meta.duration ?? 0
      measurement.rowsRead += meta.rows_read ?? 0
      const region = (meta as { served_by_region?: string }).served_by_region
      if (region) measurement.regions.add(region)
      return results
    }
  }
}

function database(env: Env, name: string | null): Queryable {
  const db = name === 'search' && env.DB_SEARCH ? env.DB_SEARCH : env.DB
  return env.READ_REPLICATION === 'on' ? db.withSession('first-unconstrained') : db
}

async function search(db: SearchDatabase, query: string, cache: boolean): Promise<SearchResults> {
  if (cache) {
    const [hit] = await db.all<{ results: string }>(
      'SELECT results FROM search_cache WHERE query = ?',
      [normalizeQuery(query)]
    )
    if (hit) return JSON.parse(hit.results)
  }
  return new DictionarySearch(db, websiteCapabilities).search(query)
}

// A word page's reads, approximated by indexed lookups on the search tables: the entry, its
// senses, and its forms' priority profiles. The real word-page tables arrive with #464.
async function wordPage(db: SearchDatabase, entryId: string) {
  await Promise.all([
    db.all('SELECT * FROM entries WHERE id = ?', [entryId]),
    db.all('SELECT * FROM canonical_senses WHERE entry_id = ?', [entryId]),
    db.all('SELECT * FROM form_priority_profiles WHERE entry_id = ?', [entryId])
  ])
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const measurement: Measurement = { queries: 0, sqlMs: 0, rowsRead: 0, regions: new Set() }
    const db = measuredDatabase(database(env, url.searchParams.get('db')), measurement)
    const started = performance.now()
    let results: SearchResults | undefined
    if (url.pathname === '/search') {
      const query = url.searchParams.get('q') ?? ''
      results = await search(db, query, url.searchParams.get('cache') === '1')
    } else if (url.pathname === '/word') {
      await wordPage(db, url.searchParams.get('id') ?? '')
    } else if (url.pathname === '/sample') {
      // Entry IDs for the word-page load, drawn once by the runner.
      const rows = await db.all<{ id: string }>(
        'SELECT id FROM entries ORDER BY random() LIMIT ?',
        [Number(url.searchParams.get('n') ?? 200)]
      )
      return Response.json(rows.map(row => row.id))
    } else {
      return new Response('Not found', { status: 404 })
    }
    return Response.json({
      // Workers only advance the clock across I/O, so this is time spent waiting on D1 plus
      // the CPU between those waits.
      ms: performance.now() - started,
      queries: measurement.queries,
      sqlMs: measurement.sqlMs,
      rowsRead: measurement.rowsRead,
      regions: [...measurement.regions],
      colo: (request.cf as { colo?: string } | undefined)?.colo ?? null,
      results: results?.items.length
    })
  }
}

// Precomputes Search's broad queries into `search_cache` (issue 464). Runs every candidate query
// (candidates.py) through the search core against a local search D1, and writes the results of
// those that read more than `rowsReadThreshold` rows as SQL.
//
//   pnpm exec tsx scripts/search-d1/precompute.mts <persist-dir> <candidates.json> <out.sql>
//
// On D1, い reads 460,276 rows and takes 1.4–3.4 s, and a few such searches stall every other
// query on the database; from the cache it takes about 30 ms.
import { readFileSync, writeFileSync } from 'node:fs'
import { getPlatformProxy } from 'wrangler'
import { normalizeQuery } from '../../src/lib/dictionary/search/query'
import {
  DictionarySearch,
  type SearchDatabase,
  type SearchResults
} from '../../src/lib/dictionary/search/search'
import { websiteCapabilities } from '../../src/lib/dictionary/search/website'

export const rowsReadThreshold = 20_000

const [persistDir, candidatesPath, outPath] = process.argv.slice(2)
if (!outPath) {
  throw new Error('usage: precompute.mts <persist-dir> <candidates.json> <out.sql>')
}

const proxy = await getPlatformProxy<CloudflareEnv>({ persist: { path: `${persistDir}/v3` } })
const searchDb = proxy.env.SEARCH_DB
if (!searchDb) throw new Error('wrangler.jsonc has no local SEARCH_DB binding')
let rowsRead = 0
const db: SearchDatabase = {
  async all<Row>(sql: string, params: readonly (string | number)[]) {
    const { results, meta } = await searchDb
      .prepare(sql)
      .bind(...params)
      .all<Row>()
    rowsRead += meta.rows_read ?? 0
    return results
  }
}
// The core itself, never the cache: these rows are what the cache will answer with.
const search = new DictionarySearch(db, websiteCapabilities)

const candidates: string[] = JSON.parse(readFileSync(candidatesPath, 'utf8'))
const cached = new Map<string, SearchResults>()
const started = Date.now()
for (const candidate of candidates) {
  const query = normalizeQuery(candidate)
  if (!query || cached.has(query)) continue
  rowsRead = 0
  const results = await search.search(query)
  if (rowsRead > rowsReadThreshold) cached.set(query, results)
}
await proxy.dispose()

const literal = (text: string) => `'${text.replaceAll("'", "''")}'`
const statements = [...cached].map(
  ([query, results]) =>
    `INSERT INTO search_cache (query, results) VALUES (${literal(query)}, ${literal(JSON.stringify(results))});`
)
writeFileSync(outPath, statements.length ? `${statements.join('\n')}\n` : '')
const longest = Math.max(0, ...statements.map(statement => Buffer.byteLength(statement)))
if (longest > 90_000) throw new Error(`A search_cache row is ${longest} bytes; D1 allows 100 KB.`)
console.log(
  `Precomputed ${cached.size} of ${candidates.length} candidates (over ` +
    `${rowsReadThreshold.toLocaleString('en-US')} rows read) in ` +
    `${Math.round((Date.now() - started) / 1000)} s.`
)

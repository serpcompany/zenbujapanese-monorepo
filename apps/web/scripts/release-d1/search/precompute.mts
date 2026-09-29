// Precomputes Search's broad queries into `search_cache` (issues 464 and 522). Runs queries
// through the search core against a local search D1, and writes the results of those that read
// more than `rowsReadThreshold` rows as SQL:
//   - every candidate query (candidates.py), and the `^` form of each ASCII one that is broad;
//   - every wildcard query `p*`, and its `^p*`, whose prefix starts a romaji or English word and
//     reads over the threshold, found by src/lib/dictionary/search/broad.ts, which searches as
//     few prefixes as it can prove the rest narrow with.
//
//   pnpm exec tsx scripts/release-d1/search/precompute.mts <persist-dir> <candidates.json> <out.sql>
//
// On D1, い reads 460,276 rows and takes 1.4–3.4 s, and a few such searches stall every other
// query on the database; from the cache it takes about 30 ms. broad.test.ts checks, on the local
// copy, that no wildcard search reads over the threshold uncached.
import { readFileSync, writeFileSync } from 'node:fs'
import { getPlatformProxy } from 'wrangler'
import {
  findBroadPrefixes,
  porterStems,
  rowsReadThreshold,
  wordPrefixes
} from '../../../src/lib/dictionary/search/broad'
import { isASCII, normalizeQuery } from '../../../src/lib/dictionary/search/query'
import {
  DictionarySearch,
  type SearchDatabase,
  type SearchResults
} from '../../../src/lib/dictionary/search/search'
import { websiteCapabilities } from '../../../src/lib/dictionary/search/website'

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

const cached = new Map<string, SearchResults>()
/** Searches `query`, keeps its results if it reads over the threshold, and returns its rows read. */
async function measure(query: string): Promise<number> {
  rowsRead = 0
  const results = await search.search(query)
  if (rowsRead > rowsReadThreshold) cached.set(query, results)
  return rowsRead
}

const started = Date.now()
const candidates: string[] = JSON.parse(readFileSync(candidatesPath, 'utf8'))
const measured = new Set<string>()
for (const candidate of candidates) {
  const query = normalizeQuery(candidate)
  if (!query || measured.has(query)) continue
  measured.add(query)
  // `^` before an English query matches only from a form's or meaning's first word in the app,
  // and on D1, whose tokenizers drop it, anywhere: as broad as the query itself.
  if ((await measure(query)) > rowsReadThreshold && isASCII(query)) await measure(`^${query}`)
}
const candidateCount = cached.size
const candidatesTook = Date.now() - started

// Wildcards: `p*` and `^p*` read exactly the same rows, which this checks on every broad one.
const prefixes = await wordPrefixes(db)
const { broad, searched, proven } = await findBroadPrefixes(prefixes, porterStems(prefixes), p =>
  measure(`${p}*`)
)
for (const prefix of broad) {
  const reads = await measure(`^${prefix}*`)
  if (reads !== searched.get(prefix)) {
    throw new Error(`^${prefix}* reads ${reads} rows but ${prefix}* reads ${searched.get(prefix)}`)
  }
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
const seconds = (ms: number) => `${Math.round(ms / 1000)} s`
console.log(
  `Precomputed ${cached.size} queries that read over ` +
    `${rowsReadThreshold.toLocaleString('en-US')} rows: ${candidateCount} of ` +
    `${candidates.length} candidates and their ^ forms in ${seconds(candidatesTook)}, and ` +
    `${broad.length * 2} wildcards (${broad.length} prefixes and their ^ forms; ` +
    `${searched.size} of ${prefixes.length} prefixes searched, ${proven} proven narrow) in ` +
    `${seconds(Date.now() - started - candidatesTook)}.`
)

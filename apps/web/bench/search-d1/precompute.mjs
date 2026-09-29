// Runs every candidate query (candidates.py) through a local copy of the benchmark Worker and
// writes the results of the broad ones as `search_cache` rows.
//   node bench/search-d1/precompute.mjs <worker-url> <candidates.json> <out.sql>
import { readFileSync, writeFileSync } from 'node:fs'

const [base, candidatesPath, outPath] = process.argv.slice(2)
if (!outPath) throw new Error('usage: precompute.mjs <worker-url> <candidates.json> <out.sql>')

/** A query that reads more rows than this is answered from the cache. */
const rowsReadThreshold = 20_000
const concurrency = 4

const candidates = JSON.parse(readFileSync(candidatesPath, 'utf8'))
const cached = new Map()
const started = Date.now()
let next = 0
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < candidates.length) {
      const candidate = candidates[next++]
      const response = await fetch(`${base}/search?full=1&q=${encodeURIComponent(candidate)}`)
      if (!response.ok) throw new Error(`${candidate}: ${response.status} ${await response.text()}`)
      const measured = await response.json()
      if (measured.rowsRead > rowsReadThreshold) cached.set(measured.query, measured.full)
    }
  })
)

const literal = text => `'${text.replaceAll("'", "''")}'`
const sql = [
  'CREATE TABLE search_cache (query TEXT PRIMARY KEY, results TEXT NOT NULL) WITHOUT ROWID;',
  ...[...cached].map(
    ([query, results]) =>
      `INSERT INTO search_cache (query, results) VALUES (${literal(query)}, ${literal(JSON.stringify(results))});`
  )
]
writeFileSync(outPath, `${sql.join('\n')}\n`)
const bytes = sql.reduce((total, line) => total + Buffer.byteLength(line), 0)
console.log(
  `Precomputed ${cached.size} of ${candidates.length} candidates (over ` +
    `${rowsReadThreshold.toLocaleString('en-US')} rows read) in ` +
    `${Math.round((Date.now() - started) / 1000)} s; ${Math.round(bytes / 1024)} KB of SQL.`
)

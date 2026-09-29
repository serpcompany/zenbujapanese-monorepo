// Drives the benchmark Worker and prints a Markdown report for the workflow summary.
//   node bench/search-d1/run.mjs <worker-url>
// Compares the search core as is with precomputed broad queries (`cache=1`) and with searches
// on their own database (`db=search`).
import { readFileSync } from 'node:fs'

const base = process.argv[2]
if (!base) throw new Error('usage: node bench/search-d1/run.mjs <worker-url>')

const broadQueries = ['い', 'の', 'to', 'of']
const suite = JSON.parse(
  readFileSync(
    new URL('../../../ios/LanguageData/Conformance/search-retrieval.json', import.meta.url)
  )
)
const suiteQueries = suite.cases.map(testCase => testCase.query)
const runs = 5
const loadSeconds = 20
const wordConcurrency = 10
const searchConcurrency = 4

async function call(path) {
  const response = await fetch(new URL(path, base))
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  return response.json()
}

const search = (query, options = '') => call(`/search?q=${encodeURIComponent(query)}${options}`)

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
}

const ms = value => Math.round(value).toLocaleString('en-US')
const count = value => value.toLocaleString('en-US')

/** A new workers.dev URL answers "Script not found" for a short while after deploying. */
async function waitUntilLive(seconds) {
  const until = Date.now() + seconds * 1000
  for (;;) {
    try {
      return await call('/sample?n=200')
    } catch (error) {
      if (Date.now() > until) throw error
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
}

async function timeQuery(query, options) {
  const samples = []
  for (let run = 0; run < runs; run += 1) samples.push(await search(query, options))
  return {
    p50: percentile(
      samples.map(s => s.ms),
      50
    ),
    last: samples.at(-1)
  }
}

/** Runs `worker` from `concurrency` loops until `seconds` pass; returns each call's result. */
async function load(seconds, concurrency, worker) {
  const until = Date.now() + seconds * 1000
  const samples = []
  await Promise.all(
    Array.from({ length: concurrency }, async (_, lane) => {
      for (let i = lane; Date.now() < until; i += concurrency) samples.push(await worker(i))
    })
  )
  return samples
}

const entryIds = await waitUntilLive(180)
await search('warm up')
const first = await call(`/word?id=${encodeURIComponent(entryIds[0])}`)

const lines = [
  '## Search on D1',
  '',
  `Worker colo ${first.colo}; D1 regions ${first.regions.join(', ') || 'not reported'}. ` +
    `${runs} runs per query, run one at a time. Times are milliseconds measured in the Worker. ` +
    '*Precomputed* answers a broad query from `search_cache` and costs other queries one extra ' +
    'lookup.',
  '',
  '| Query | As is, p50 | SQL | D1 queries | Rows read | Precomputed, p50 | D1 queries | Rows read |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
]
for (const query of [...broadQueries, ...suiteQueries]) {
  const plain = await timeQuery(query, '')
  const cached = await timeQuery(query, '&cache=1')
  lines.push(
    `| ${query} | ${ms(plain.p50)} | ${ms(plain.last.sqlMs)} | ${plain.last.queries} | ` +
      `${count(plain.last.rowsRead)} | ${ms(cached.p50)} | ${cached.last.queries} | ` +
      `${count(cached.last.rowsRead)} |`
  )
}

const word = i => call(`/word?id=${encodeURIComponent(entryIds[i % entryIds.length])}`)
const broad = options => i => search(broadQueries[i % broadQueries.length], options)
const variants = [
  ['Word pages alone', null],
  ['With broad searches, as is', broad('')],
  ['With broad searches, precomputed', broad('&cache=1')],
  ['With broad searches on their own database', broad('&db=search')],
  ['With broad searches, precomputed, on their own database', broad('&cache=1&db=search')]
]

lines.push(
  '',
  '## Word-page reads under load',
  '',
  `${wordConcurrency} concurrent word-page requests for ${loadSeconds} s, alone and alongside ` +
    `${searchConcurrency} concurrent broad searches (${broadQueries.join(', ')}).`,
  '',
  '| Word pages | Requests | p50 | p95 | max | Searches done |',
  '| --- | ---: | ---: | ---: | ---: | ---: |'
)
for (const [label, searcher] of variants) {
  const [words, searches = []] = await Promise.all([
    load(loadSeconds, wordConcurrency, word),
    ...(searcher ? [load(loadSeconds, searchConcurrency, searcher)] : [])
  ])
  const times = words.map(s => s.ms)
  lines.push(
    `| ${label} | ${count(words.length)} | ${ms(percentile(times, 50))} | ` +
      `${ms(percentile(times, 95))} | ${ms(Math.max(...times))} | ${count(searches.length)} |`
  )
}
console.log(lines.join('\n'))

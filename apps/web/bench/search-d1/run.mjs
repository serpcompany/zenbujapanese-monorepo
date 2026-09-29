// Drives the benchmark Worker and prints a Markdown report for the workflow summary.
//   node bench/search-d1/run.mjs <worker-url>
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

const search = query => call(`/search?q=${encodeURIComponent(query)}`)

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
}

const ms = value => Math.round(value).toLocaleString('en-US')

async function timeQuery(query) {
  const samples = []
  for (let run = 0; run < runs; run += 1) samples.push(await search(query))
  const last = samples.at(-1)
  return {
    query,
    p50: percentile(
      samples.map(s => s.ms),
      50
    ),
    max: Math.max(...samples.map(s => s.ms)),
    sql: percentile(
      samples.map(s => s.sqlMs),
      50
    ),
    queries: last.queries,
    rowsRead: last.rowsRead,
    results: last.results
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

function loadRow(label, samples) {
  const times = samples.map(s => s.ms)
  return `| ${label} | ${samples.length} | ${ms(percentile(times, 50))} | ${ms(percentile(times, 95))} | ${ms(Math.max(...times))} |`
}

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

const entryIds = await waitUntilLive(180)
await search('warm up')
const first = await call(`/word?id=${encodeURIComponent(entryIds[0])}`)

const lines = [
  '## Search on D1',
  '',
  `Worker colo ${first.colo}; D1 regions ${first.regions.join(', ') || 'not reported'}. ` +
    `${runs} runs per query, run one at a time. Times are milliseconds measured in the Worker; ` +
    'SQL is the D1-reported time summed over the request’s statements.',
  '',
  '| Query | p50 | max | SQL p50 | D1 queries | Rows read | Results |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'
]
for (const query of [...broadQueries, ...suiteQueries]) {
  const row = await timeQuery(query)
  lines.push(
    `| ${row.query} | ${ms(row.p50)} | ${ms(row.max)} | ${ms(row.sql)} | ${row.queries} | ` +
      `${row.rowsRead.toLocaleString('en-US')} | ${row.results} |`
  )
}

const word = i => call(`/word?id=${encodeURIComponent(entryIds[i % entryIds.length])}`)
const alone = await load(loadSeconds, wordConcurrency, word)
let contended = []
await Promise.all([
  load(loadSeconds, wordConcurrency, word).then(samples => {
    contended = samples
  }),
  load(loadSeconds, searchConcurrency, i => search(broadQueries[i % broadQueries.length]))
])

lines.push(
  '',
  `## Word-page reads under load`,
  '',
  `${wordConcurrency} concurrent word-page requests for ${loadSeconds} s, alone and alongside ` +
    `${searchConcurrency} concurrent broad searches (${broadQueries.join(', ')}).`,
  '',
  '| Word pages | Requests | p50 | p95 | max |',
  '| --- | ---: | ---: | ---: | ---: |',
  loadRow('Alone', alone),
  loadRow('With broad searches', contended)
)
console.log(lines.join('\n'))

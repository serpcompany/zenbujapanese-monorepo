import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { searchExamplePageOn, searchExamplesOn, searchOn } from '../data'
import type { Links } from '../page-example'
import { primaryItem } from '../results/results'
import { kuromojiFiles } from './kuromoji'
import { exampleLimit } from './retrieval'

// The example-search suite, recorded from the app on the iOS Simulator
// (apps/ios/LanguageData/Conformance/example-search.json, ExampleSearchConformanceTests.swift):
// for each query, what Search's "View N Example Sentences" row counts and the Example Sentences
// screen it opens lists. Every case runs through the website's search and example search on a
// local search D1 built by `scripts/release-d1/load-local.sh search` (at .search-d1/, or
// ZENBU_SEARCH_D1_PATH), as the pages read them (data.ts). The search import runs it before
// anything reaches D1 (scripts/release-d1/search/database.sh's check_local), so it only runs when
// ZENBU_SEARCH_D1=1.
//
// Compared: the row's count and title, the entry the screen links words to, whether it lists that
// entry's examples, every listed sentence's pair ID in order (up to the app's 100), and for the
// first sentences their text, translation, and each word's surface, entry or candidates, and
// whether the screen marks it as part of the query.
const enabled = process.env.ZENBU_SEARCH_D1 === '1'

interface SuiteToken {
  surface: string
  entry?: string
  candidates?: string[]
  queryMatch?: boolean
}

interface SuiteCase {
  query: string
  covers?: string
  count?: number
  title?: string
  highlightedEntry?: string
  usesPrimaryEntryExamples?: boolean
  ids?: string[]
  shown?: { id: string; japanese: string; english: string; tokens: SuiteToken[] }[]
}

interface Suite {
  artifacts: { name: string; sha256: string }[]
  tokenLimit: number
  cases: SuiteCase[]
}

// Read only when the suite runs, so moving the file (#469) can't break `pnpm test`.
const suite: Suite = enabled
  ? JSON.parse(
      readFileSync(
        new URL('../../../../../ios/LanguageData/Conformance/example-search.json', import.meta.url),
        'utf8'
      )
    )
  : { artifacts: [], tokenLimit: 0, cases: [] }

const resources = new URL(
  '../../../../../ios/Modules/Sources/SearchExperience/Resources/',
  import.meta.url
)

/** The suite records entries, not pages, so no word links anywhere here. */
const noLinks: Links = { word: () => null, kanji: () => null }

/** The app's pair IDs: `esp1_` and the pair's 16 bytes in hex. */
const appPairId = (pairId: string) => `esp1_${pairId}`

describe.runIf(enabled)('example search conformance on D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<CloudflareEnv>>>
  let db: D1Database
  /** Each entry the suite names, by Language Reference ID, to its `ent_seq`. */
  let entSeqs: Map<string, number>

  beforeAll(async () => {
    proxy = await getPlatformProxy<CloudflareEnv>({
      persist: { path: `${process.env.ZENBU_SEARCH_D1_PATH ?? '.search-d1'}/v3` }
    })
    const bound = proxy.env.SEARCH_DB
    if (!bound) throw new Error('wrangler.jsonc has no local SEARCH_DB binding')
    db = bound
    const pinned = suite.artifacts.find(
      artifact => artifact.name === 'LanguageReferenceData.sqlite3'
    )
    const loaded = await db
      .prepare('SELECT artifact, sha256 FROM dictionary_import')
      .first<{ artifact: string; sha256: string }>()
      .catch(() => null)
    if (!pinned || loaded?.sha256 !== pinned.sha256) {
      throw new Error(
        `.search-d1 holds ${loaded ? `${loaded.artifact} ${loaded.sha256}` : 'no recorded artifact'}, ` +
          `but the suite pins LanguageReferenceData.sqlite3 ${pinned?.sha256}. Rebuild it from ` +
          'that artifact with scripts/release-d1/load-local.sh search, or record the suite again.'
      )
    }
    // The import reads ExampleWordIndex and Kuromoji's engine and dictionary from the repository,
    // which must be the files the suite was recorded with.
    const files = [
      'ExampleWordIndex.sqlite3',
      ...Object.keys(kuromojiFiles).map(file => `Kuromoji/${file}`)
    ]
    for (const file of files) {
      const recorded = suite.artifacts.find(artifact => artifact.name === file)?.sha256
      const actual = createHash('sha256')
        .update(readFileSync(new URL(file, resources)))
        .digest('hex')
      if (actual !== recorded) {
        throw new Error(`${file} is ${actual}, but the suite pins ${recorded}. Record it again.`)
      }
    }
    const ids = new Set(
      suite.cases.flatMap(expected => [
        ...(expected.highlightedEntry ? [expected.highlightedEntry] : []),
        ...(expected.shown ?? []).flatMap(example =>
          example.tokens.flatMap(token => [
            ...(token.entry ? [token.entry] : []),
            ...(token.candidates ?? [])
          ])
        )
      ])
    )
    const { results } = await db
      .prepare(
        'SELECT id, source_record_id FROM entries WHERE id IN (SELECT value FROM json_each(?))'
      )
      .bind(JSON.stringify([...ids]))
      .all<{ id: string; source_record_id: number }>()
    entSeqs = new Map(results.map(row => [row.id, row.source_record_id]))
    for (const id of ids) {
      if (!entSeqs.has(id)) throw new Error(`The search database has no entry ${id}`)
    }
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  test('the suite covers the Example Sentences row’s queries and more', () => {
    expect(suite.cases.length).toBeGreaterThanOrEqual(50)
    expect(suite.tokenLimit).toBeGreaterThan(0)
  })

  // The word search for a prefix such as t* takes a few seconds on a local D1.
  test.each(suite.cases)('「$query」', async expected => {
    // As data.ts reads them: the search and the row's count, then the page's list.
    const { results, screen } = await searchOn(db, expected.query)
    const row = screen.state === 'results' ? screen.examples : null
    const found = await searchExamplesOn(db, expected.query)
    const listed = found ? await found.search.sentences(found.list.ids) : []
    const shown = found
      ? (await searchExamplePageOn(found, expected.query, 0, async () => noLinks)).slice(
          0,
          suite.tokenLimit
        )
      : []
    const entSeqOf = (id: string) => entSeqs.get(id) as number

    const actual = {
      count: row?.count ?? 0,
      title: row?.title,
      highlightedEntry: primaryItem(results, expected.query)?.entry.id,
      usesPrimaryEntryExamples: results.usesPrimaryEntryExamples,
      ids: listed.map(sentence => appPairId(sentence.pairId)),
      shown: shown.map((example, index) => ({
        id: appPairId(listed[index].pairId),
        japanese: example.text,
        english: example.translation,
        tokens: example.tokens.map(token => ({
          surface: token.text,
          ...(token.link && 'entSeq' in token.link ? { entry: token.link.entSeq } : {}),
          ...(token.link && 'entSeqs' in token.link ? { candidates: token.link.entSeqs } : {}),
          ...(token.isPageWord ? { queryMatch: true } : {})
        }))
      }))
    }
    const wanted = {
      count: expected.count,
      title: expected.title,
      highlightedEntry: expected.highlightedEntry,
      usesPrimaryEntryExamples: expected.usesPrimaryEntryExamples,
      ids: expected.ids,
      shown: (expected.shown ?? []).map(example => ({
        ...example,
        tokens: example.tokens.map(token => ({
          surface: token.surface,
          ...(token.entry ? { entry: entSeqOf(token.entry) } : {}),
          ...(token.candidates ? { candidates: token.candidates.map(entSeqOf) } : {}),
          ...(token.queryMatch ? { queryMatch: true } : {})
        }))
      }))
    }
    expect(actual.ids, `「${expected.query}」 lists different sentences`).toEqual(wanted.ids)
    expect(actual).toEqual(wanted)
    expect(actual.ids.length).toBeLessThanOrEqual(exampleLimit)
  }, 30_000)
})

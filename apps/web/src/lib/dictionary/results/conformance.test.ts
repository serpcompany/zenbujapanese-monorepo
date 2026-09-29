import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { tierLabels } from '@zenbu/dictionary-core/detail/frequency'
import {
  loadFrequency,
  type SearchResultsScreen,
  searchResultsScreen
} from '@zenbu/dictionary-core/results/results'
import {
  EvidenceLane,
  FormRelation,
  GlossRelation,
  type Rank
} from '@zenbu/dictionary-core/search/rank'
import { type SearchResultItem, searchFeatures } from '@zenbu/dictionary-core/search/search'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import {
  d1SearchDatabase,
  type WebsiteSearch,
  websiteCapabilities,
  websiteSearch
} from '../search/website'

// The search results suite, recorded from the app on the iOS Simulator
// (apps/ios/LanguageData/Conformance/search-results.json, SearchResultsConformanceTests.swift):
// the results screen after the frequency re-sort. Every case runs through the website's search,
// the frequency it reads from the search database, and the results screen core, as the page
// does (data.ts), against a local search D1 built by `scripts/release-d1/load-local.sh search`
// (at .search-d1/, or ZENBU_SEARCH_D1_PATH). The search import runs it before anything reaches D1
// (scripts/release-d1/search/database.sh's check_local), so it only runs when ZENBU_SEARCH_D1=1.
//
// Compared: the state, resolution, presentation, sections, the reading refinement, the kanji row,
// every row (ID, entry number, headword, reading, meaning, chips, match group, and retrieval
// position, in order), and the count VoiceOver reads. Not compared, since the website has no
// sentence search yet (#511): the `examples` section, "View N Example Sentences".
const enabled = process.env.ZENBU_SEARCH_D1 === '1'

interface SuiteChip {
  pack?: string
  name: string
  text: string
  tier?: string
}

interface SuiteRow {
  languageReferenceID: string
  entSeq: string[]
  headword: string
  reading: string
  summary: string
  chips: SuiteChip[]
  match: string
  retrievalOrder: number
}

interface SuiteCase {
  query: string
  covers?: string
  resolution?: string
  presentation?: string
  state?: string
  sections?: string[]
  examples?: { title: string; count: number; primaryEntry?: string }
  readingRefinement?: { title: string; query: string }
  heading?: string
  kanji?: { character: string; label: string; summary: string; entry?: string }
  results?: SuiteRow[]
  voiceOverCount?: number
  frequencyNotice?: string
}

interface Suite {
  artifacts: { name: string; sha256: string }[]
  frequencyPacks: string[]
  cases: SuiteCase[]
}

// Read only when the suite runs, so moving the file (#469) can't break `pnpm test`.
const suite: Suite = enabled
  ? JSON.parse(
      readFileSync(
        new URL('../../../../../ios/LanguageData/Conformance/search-results.json', import.meta.url),
        'utf8'
      )
    )
  : { artifacts: [], frequencyPacks: [], cases: [] }

/** The app's pack IDs for the website's default frequency dictionaries, by short name. */
const packIds: Record<string, string> = {
  JLPT: 'zenbu.jlpt.waller.levels',
  YouTube: 'zenbu.tubelex.youtube.ja.unidic-3.1'
}

const resources = '../../../../../ios/Modules/Sources/SearchExperience/Resources/'
const frequencyPackFiles = ['JLPTLevelPack.sqlite3', 'TUBELEXFrequencyPack.sqlite3']

/** Fields the website can't show yet (#511): the Example Sentences row needs sentence search. */
const pendingSections = new Set(['examples'])

const name = (values: Record<string, number>, value: number) =>
  Object.keys(values).find(key => values[key] === value) ?? String(value)

/** SearchResultsConformanceTests.swift's `describe(_:)`: the row's match group. */
function describeMatch(item: SearchResultItem): string {
  const rank: Rank = item.matchRank
  const match =
    rank.kind === 'japanese'
      ? `japanese ${name(FormRelation, rank.relation)}`
      : `english ${name(EvidenceLane, rank.lane)} corroboration=${rank.corroborationRank} ` +
        `romaji=${rank.romajiSpecificityRank} sense=${rank.senseOrder} ${name(GlossRelation, rank.relation)}`
  return `source=${item.sourceOrder} ${match}`
}

/** A case as the website shows it, in the suite's shape. */
function observed(
  expected: SuiteCase,
  screen: SearchResultsScreen,
  resolution: string,
  presentation: string,
  items: Map<string, SearchResultItem>
): SuiteCase {
  const base = { query: expected.query, resolution, presentation }
  if (screen.state === 'noResults') return { ...base, state: 'noResults' }
  return {
    ...base,
    state: 'results',
    sections: screen.sections,
    ...(screen.readingRefinement
      ? {
          readingRefinement: {
            title: screen.readingRefinement.title,
            query: screen.readingRefinement.query
          }
        }
      : {}),
    ...(screen.kanji
      ? {
          kanji: {
            character: screen.kanji.character,
            label: screen.kanji.label,
            summary: screen.kanji.summary,
            ...(screen.kanji.entryId ? { entry: screen.kanji.entryId } : {})
          }
        }
      : {}),
    results: screen.rows.map(row => ({
      languageReferenceID: row.id,
      entSeq: [String(row.entSeq)],
      headword: row.headword,
      reading: row.reading,
      summary: row.summary,
      chips: row.chips.map(chip => ({
        pack: packIds[chip.source],
        name: chip.source,
        text: chip.value,
        ...(chip.tier ? { tier: tierLabels[chip.tier] } : {})
      })),
      match: describeMatch(items.get(row.id) as SearchResultItem),
      retrievalOrder: row.retrievalOrder
    })),
    voiceOverCount: screen.resultCount
  }
}

/** The recorded case without what the website can't show yet. */
function comparable(expected: SuiteCase): SuiteCase {
  const { covers: _covers, examples: _examples, ...rest } = expected
  return {
    ...rest,
    ...(rest.sections
      ? { sections: rest.sections.filter(section => !pendingSections.has(section)) }
      : {}),
    ...(rest.results
      ? {
          // The website keeps the entry number of the row's Language Reference ID, the first of
          // the app's merged provenances.
          results: rest.results.map(row => ({ ...row, entSeq: row.entSeq.slice(0, 1) }))
        }
      : {})
  }
}

// Sentence search (`analyzed` or Discovered Words) needs the app's analyzer, which the website
// leaves out (ADR 0008); the suite records none, since its recorder can't split words either.
const features = searchFeatures(websiteCapabilities)
const needsSentenceSearch = (expected: SuiteCase) =>
  (expected.resolution === 'analyzed' || expected.presentation === 'discoveredWords') &&
  !features.sentenceSearch
const supportedCases = suite.cases.filter(expected => !needsSentenceSearch(expected))
const unsupportedCases = suite.cases.filter(needsSentenceSearch)

const describeRows = (rows: SuiteRow[] = []) =>
  rows
    .slice(0, 12)
    .map(row => `${row.headword}（${row.reading}）`)
    .join(', ')

describe.runIf(enabled)('search results conformance on D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<CloudflareEnv>>>
  let db: D1Database
  let search: WebsiteSearch

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
    // entry_frequency comes from the packs in the repository (build-rows.py), which must be the
    // ones the suite was recorded with.
    for (const pack of frequencyPackFiles) {
      const recorded = suite.artifacts.find(artifact => artifact.name === pack)?.sha256
      const file = new URL(`${resources}${pack}`, import.meta.url)
      const actual = createHash('sha256').update(readFileSync(file)).digest('hex')
      if (actual !== recorded) {
        throw new Error(
          `${pack} is ${actual}, but the suite pins ${recorded}. Record the suite again with it.`
        )
      }
    }
    search = websiteSearch(db)
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  test('the suite was recorded with the default frequency dictionaries, JLPT then YouTube', () => {
    expect(suite.frequencyPacks).toEqual([packIds.JLPT, packIds.YouTube])
  })

  if (supportedCases.length > 0) {
    test.each(supportedCases)('「$query」', async expected => {
      const results = await search.search(expected.query)
      const frequency = await loadFrequency(d1SearchDatabase(db), results)
      const screen = searchResultsScreen(expected.query, results, frequency)
      const actual = observed(
        expected,
        screen,
        results.resolution,
        results.presentation,
        new Map(results.items.map(item => [item.entry.id, item]))
      )
      const wanted = comparable(expected)
      expect(
        actual.results?.map(row => row.languageReferenceID),
        `「${expected.query}」 expected ${describeRows(wanted.results)} but found ${describeRows(actual.results)}`
      ).toEqual(wanted.results?.map(row => row.languageReferenceID))
      expect(actual).toEqual(wanted)
    })
  }

  if (unsupportedCases.length > 0) {
    test.skip.each(unsupportedCases)('「$query」 needs sentence search', () => {})
  }
})

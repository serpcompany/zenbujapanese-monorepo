import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { tierLabels } from '@zenbu/dictionary-core/detail/frequency'
import type { SearchResultsScreen } from '@zenbu/dictionary-core/results/results'
import {
  EvidenceLane,
  FormRelation,
  GlossRelation,
  type Rank
} from '@zenbu/dictionary-core/search/rank'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, dictionary, readSuite, requirePinnedArtifacts } from './support'

// The search results suite (search-results.json, SearchResultsConformanceTests.swift): the
// results screen after the frequency re-sort, as the service answers a search. Compared: the
// state, sections, the Example Sentences row (its title, count, and the primary entry it opens),
// the reading refinement, the kanji row, every row (ID, entry number, headword, reading,
// meaning, chips, match group, and retrieval position, in order), and the count VoiceOver reads.
// The app recorded it with reduced text analysis (the suite's `textAnalysis`), so it runs
// without Sudachi, as the app did.

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
  textAnalysis: string
  cases: SuiteCase[]
}

const suite = readSuite<Suite>('search-results')

/** The app's pack IDs for the default frequency dictionaries, by short name. */
const packIds: Record<string, string> = {
  JLPT: 'zenbu.jlpt.waller.levels',
  YouTube: 'zenbu.tubelex.youtube.ja.unidic-3.1'
}

const name = (values: Record<string, number>, value: number) =>
  Object.keys(values).find(key => values[key] === value) ?? String(value)

/** SearchResultsConformanceTests.swift's `describe(_:)`: a row's match group. */
function describeMatch(sourceOrder: number, rank: Rank): string {
  const match =
    rank.kind === 'japanese'
      ? `japanese ${name(FormRelation, rank.relation)}`
      : `english ${name(EvidenceLane, rank.lane)} corroboration=${rank.corroborationRank} ` +
        `romaji=${rank.romajiSpecificityRank} sense=${rank.senseOrder} ${name(GlossRelation, rank.relation)}`
  return `source=${sourceOrder} ${match}`
}

/** A case as the service answers it, in the suite's shape. */
function observed(
  expected: SuiteCase,
  screen: SearchResultsScreen,
  results: Awaited<ReturnType<Dictionary['searchResults']>>
): SuiteCase {
  const items = new Map(results.items.map(item => [item.entry.id, item]))
  const base = {
    query: expected.query,
    resolution: results.resolution,
    presentation: results.presentation
  }
  if (screen.state === 'noResults') return { ...base, state: 'noResults' }
  return {
    ...base,
    state: 'results',
    sections: screen.sections,
    ...(screen.examples
      ? {
          examples: {
            count: screen.examples.count,
            ...(screen.examples.primaryEntry ? { primaryEntry: screen.examples.primaryEntry } : {}),
            title: screen.examples.title
          }
        }
      : {}),
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
    results: screen.rows.map(row => {
      const item = items.get(row.id)
      if (!item) throw new Error(`No search result for row ${row.id}`)
      return {
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
        match: describeMatch(item.sourceOrder, item.matchRank),
        retrievalOrder: row.retrievalOrder
      }
    }),
    voiceOverCount: screen.resultCount
  }
}

/** The recorded case as the service reports it. */
function comparable(expected: SuiteCase): SuiteCase {
  const { covers: _covers, ...rest } = expected
  return {
    ...rest,
    ...(rest.results
      ? {
          // The service keeps the entry number of the row's Language Reference ID, the first of
          // the app's merged provenances.
          results: rest.results.map(row => ({ ...row, entSeq: row.entSeq.slice(0, 1) }))
        }
      : {})
  }
}

const describeRows = (rows: SuiteRow[] = []) =>
  rows
    .slice(0, 12)
    .map(row => `${row.headword}（${row.reading}）`)
    .join(', ')

describe.runIf(artifactAvailable)('search results conformance', () => {
  let service: Dictionary

  beforeAll(async () => {
    requirePinnedArtifacts(suite.artifacts)
    // Recorded without Sudachi: no sentence search, as in the app.
    expect(suite.textAnalysis).toBe('reduced')
    service = await dictionary({ morphology: false })
  })

  test('the suite was recorded with the default frequency dictionaries, JLPT then YouTube', () => {
    expect(suite.frequencyPacks).toEqual([packIds.JLPT, packIds.YouTube])
  })

  test.each(suite.cases)('「$query」', async expected => {
    const results = await service.searchResults(expected.query)
    const { screen } = await service.search(expected.query)
    const actual = observed(expected, screen, results)
    const wanted = comparable(expected)
    expect(
      actual,
      `「${expected.query}」: expected ${describeRows(wanted.results)} but found ${describeRows(actual.results)}`
    ).toEqual(wanted)
  })
})

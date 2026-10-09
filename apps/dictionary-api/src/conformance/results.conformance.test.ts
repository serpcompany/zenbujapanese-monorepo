import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { tierLabels } from '@zenbu/dictionary-core/detail/frequency'
import type { SearchResultsScreen } from '@zenbu/dictionary-core/results/results'
import {
  EvidenceLane,
  FormRelation,
  isLaterSense,
  type Rank
} from '@zenbu/dictionary-core/search/rank'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, dictionary, readSuite, requirePinnedArtifacts } from './support'

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

const defaultFrequencyPackIds: Record<string, string> = {
  JLPT: 'zenbu.jlpt.waller.levels',
  YouTube: 'zenbu.tubelex.youtube.ja.unidic-3.1'
}

const name = (values: Record<string, number>, value: number) =>
  Object.keys(values).find(key => values[key] === value) ?? String(value)

function describeMatch(sourceOrder: number, rank: Rank): string {
  const match =
    rank.kind === 'japanese'
      ? `japanese ${name(FormRelation, rank.relation)}`
      : `english ${name(EvidenceLane, rank.lane)} romaji=${rank.romajiSpecificityRank}` +
        (rank.lane === EvidenceLane.strongGloss
          ? ` sense=${isLaterSense(rank) ? 'later' : 'first'}`
          : '')
  return `source=${sourceOrder} ${match}`
}

function caseAsTheServiceAnswers(
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
          pack: defaultFrequencyPackIds[chip.source],
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

const withFirstProvenanceOnly = (row: SuiteRow): SuiteRow => ({
  ...row,
  entSeq: row.entSeq.slice(0, 1)
})

function recordedCaseAsTheServiceReports(expected: SuiteCase): SuiteCase {
  const { covers: _covers, ...rest } = expected
  return {
    ...rest,
    ...(rest.results ? { results: rest.results.map(withFirstProvenanceOnly) } : {})
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
    expect(suite.textAnalysis, 'the app recorded the suite without Sudachi').toBe('reduced')
    service = await dictionary({ morphology: false })
  })

  test('the suite was recorded with the default frequency dictionaries, JLPT then YouTube', () => {
    expect(suite.frequencyPacks).toEqual([
      defaultFrequencyPackIds.JLPT,
      defaultFrequencyPackIds.YouTube
    ])
  })

  test.each(suite.cases)('「$query」', async expected => {
    const results = await service.searchResults(expected.query)
    const { screen } = await service.search(expected.query)
    const actual = caseAsTheServiceAnswers(expected, screen, results)
    const wanted = recordedCaseAsTheServiceReports(expected)
    expect(
      actual,
      `「${expected.query}」: expected ${describeRows(wanted.results)} but found ${describeRows(actual.results)}`
    ).toEqual(wanted)
  })
})

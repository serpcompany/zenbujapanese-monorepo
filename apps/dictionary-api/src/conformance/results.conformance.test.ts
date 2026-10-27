import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import {
  discoveredWordsHeading,
  type SearchResultsScreen
} from '@zenbu/dictionary-core/results/results'
import { matchLabel } from '@zenbu/dictionary-core/search/rank'
import { beforeAll, describe, expect, test } from 'vitest'
import { sudachiContract } from '../sudachi'
import {
  caseAsShown,
  defaultFrequencyPackIds,
  describeRows,
  type ResultsSuite,
  recordedCaseAsTheCoreReports,
  resultsSuite,
  type ShownScreen,
  sentenceResultsSuite,
  suiteChip,
  suiteRows
} from './results-suite'
import {
  artifactAvailable,
  dictionary,
  readSuite,
  recordedSudachi,
  requirePinnedArtifacts,
  resources,
  sudachiAvailable
} from './support'

const websiteHeading = (sections: readonly string[]) =>
  sections.includes('discoveredWords') ? discoveredWordsHeading : null

function shown(
  screen: Extract<SearchResultsScreen, { state: 'results' }>,
  results: Awaited<ReturnType<Dictionary['searchResults']>>
): ShownScreen {
  const items = new Map(results.items.map(item => [item.entry.id, item]))
  return {
    sections: screen.sections,
    examples: screen.examples,
    readingRefinement: screen.readingRefinement,
    heading: websiteHeading(screen.sections),
    kanji: screen.kanji && { ...screen.kanji, entry: screen.kanji.entryId },
    rows: suiteRows(screen.rows, items, (row, item) => ({
      entSeq: [String(row.entSeq)],
      headword: row.headword,
      reading: row.reading,
      summary: row.summary,
      chips: row.chips.map(chip => suiteChip(chip, defaultFrequencyPackIds[chip.source])),
      match: matchLabel(item.sourceOrder, item.matchRank),
      retrievalOrder: row.retrievalOrder
    })),
    resultCount: screen.resultCount
  }
}

function replaysTheScreens(suite: ResultsSuite, service: () => Dictionary) {
  test('the suite was recorded with the default frequency dictionaries, JLPT then YouTube', () => {
    expect(suite.frequencyPacks).toEqual([
      defaultFrequencyPackIds.JLPT,
      defaultFrequencyPackIds.YouTube
    ])
  })

  test.each(suite.cases)('「$query」', async expected => {
    const results = await service().searchResults(expected.query)
    const { screen } = await service().search(expected.query)
    const actual = caseAsShown(
      { query: expected.query, resolution: results.resolution, presentation: results.presentation },
      screen.state === 'results' ? shown(screen, results) : null
    )
    const wanted = recordedCaseAsTheCoreReports(expected)
    expect(
      actual,
      `「${expected.query}」: expected ${describeRows(wanted.results)} but found ${describeRows(actual.results)}`
    ).toEqual(wanted)
  })
}

describe.runIf(artifactAvailable)('search results conformance', () => {
  let service: Dictionary

  beforeAll(async () => {
    requirePinnedArtifacts(resultsSuite.artifacts)
    expect(resultsSuite.textAnalysis, 'the app recorded the suite without Sudachi').toBe('reduced')
    expect(recordedSudachi(resultsSuite.artifacts)).toBeUndefined()
    service = await dictionary({ morphology: false })
  })

  replaysTheScreens(resultsSuite, () => service)
})

describe.runIf(artifactAvailable && sudachiAvailable)('sentence results conformance', () => {
  let service: Dictionary

  beforeAll(async () => {
    requirePinnedArtifacts(sentenceResultsSuite.artifacts)
    expect(sentenceResultsSuite.textAnalysis, 'the app recorded the suite with Sudachi').toBe(
      'full'
    )
    expect(recordedSudachi(sentenceResultsSuite.artifacts)).toBe(
      sudachiContract(resources).installedSHA256
    )
    service = await dictionary({ morphology: true })
  })

  test('holds the screen of every sentence the sentence suite lists Discovered Words for', () => {
    const sentences = readSuite<{ cases: { query: string; presentation: string }[] }>(
      'sentence-search'
    ).cases.filter(({ presentation }) => presentation === 'discoveredWords')
    expect(sentenceResultsSuite.cases.map(({ query }) => query)).toEqual(
      sentences.map(({ query }) => query)
    )
  })

  replaysTheScreens(sentenceResultsSuite, () => service)
})

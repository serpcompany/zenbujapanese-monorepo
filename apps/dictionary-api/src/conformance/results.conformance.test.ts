import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import type { SearchResultsScreen } from '@zenbu/dictionary-core/results/results'
import { matchLabel } from '@zenbu/dictionary-core/search/rank'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  caseAsShown,
  defaultFrequencyPackIds,
  describeRows,
  recordedCaseAsTheCoreReports,
  type ShownScreen,
  resultsSuite as suite,
  suiteChip,
  suiteRows
} from './results-suite'
import { artifactAvailable, dictionary, requirePinnedArtifacts } from './support'

function shown(
  screen: Extract<SearchResultsScreen, { state: 'results' }>,
  results: Awaited<ReturnType<Dictionary['searchResults']>>
): ShownScreen {
  const items = new Map(results.items.map(item => [item.entry.id, item]))
  return {
    sections: screen.sections,
    heading: null,
    examples: screen.examples,
    readingRefinement: screen.readingRefinement,
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
    const actual = caseAsShown(
      { query: expected.query, resolution: results.resolution, presentation: results.presentation },
      screen.state === 'results' ? shown(screen, results) : null
    )
    const { heading: _titledByThePage, ...wanted } = recordedCaseAsTheCoreReports(expected)
    expect(
      actual,
      `「${expected.query}」: expected ${describeRows(wanted.results)} but found ${describeRows(actual.results)}`
    ).toEqual(wanted)
  })
})

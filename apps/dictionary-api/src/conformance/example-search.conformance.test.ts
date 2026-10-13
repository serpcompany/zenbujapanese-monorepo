import type { ArtifactDatabase } from '@zenbu/dictionary-core/artifact/database'
import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { exampleCountText } from '@zenbu/dictionary-core/detail/examples'
import { primaryItem } from '@zenbu/dictionary-core/results/results'
import { normalizeQuery } from '@zenbu/dictionary-core/search/query'
import { beforeAll, describe, expect, test } from 'vitest'
import { type ExampleSearchCase, exampleSearchSuite as suite } from './example-search-suite'
import { shownAsRecorded } from './examples'
import { artifactAvailable, artifactDatabase, dictionary, requirePinnedArtifacts } from './support'

const rowCountForMoreThanFifty = 51

describe.runIf(artifactAvailable)('example search conformance', () => {
  let service: Dictionary
  let db: ArtifactDatabase

  beforeAll(async () => {
    requirePinnedArtifacts(suite.artifacts)
    service = await dictionary({ morphology: false })
    db = await artifactDatabase()
  })

  test.each(suite.cases)('「$query」: $covers', async expected => {
    const results = await service.searchResults(expected.query)
    const { screen } = await service.search(expected.query)
    const row = screen.state === 'results' ? screen.examples : null
    const found = await service.searchExamples(expected.query, 0, 100)
    const shown = found?.rows.slice(0, suite.tokenLimit) ?? []
    const highlightedEntry = primaryItem(results, normalizeQuery(expected.query))?.entry.id
    const countText = exampleCountText(found)

    const observed: Omit<ExampleSearchCase, 'query' | 'covers'> = {
      ...(row ? { title: row.title } : {}),
      count: row?.count ?? 0,
      ...(countText ? { countText } : {}),
      ...(highlightedEntry ? { highlightedEntry } : {}),
      usesPrimaryEntryExamples: results.usesPrimaryEntryExamples,
      ids: found?.rows.map(({ sentence }) => `esp1_${sentence.pairId}`) ?? [],
      shown: shownAsRecorded(db, shown, 'queryMatch')
    }
    const { query: _query, covers: _covers, ...recorded } = expected
    expect(observed).toEqual(recorded)
    if (found) {
      expect(
        found.listed === expected.count || expected.count === rowCountForMoreThanFifty,
        'the page lists what the row counts'
      ).toBe(true)
    }
  })
})

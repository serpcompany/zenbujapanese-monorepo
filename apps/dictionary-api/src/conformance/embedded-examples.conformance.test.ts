import type { EmbeddedSearchResults } from '@zenbu/dictionary-core/embedded/lookup'
import type { LearnerResultsScreen } from '@zenbu/dictionary-core/results/learner'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  type Embedded,
  type EmbeddedSentence,
  embedded,
  shownAsTheAppLinks
} from './embedded-support'
import { type ExampleSearchCase, exampleSearchSuite as suite } from './example-search-suite'
import { artifactAvailable, requirePinnedArtifacts } from './support'

describe.runIf(artifactAvailable)('the app’s example sentences on the artifact', () => {
  let app: Embedded

  beforeAll(async () => {
    requirePinnedArtifacts(suite.artifacts)
    app = await embedded()
  })

  test.each(
    suite.cases
  )('lists 「$query」’s examples as the suite records: $covers', async expected => {
    const { query } = expected
    const results = await app.lookup<EmbeddedSearchResults>('search', query)
    const listed = {
      query,
      primaryEntry: results.primaryEntry,
      usesPrimaryEntryExamples: results.usesPrimaryEntryExamples
    }
    const count = await app.text<number>('resultsExampleCount', listed)
    const screen = await app.presentation<LearnerResultsScreen>('resultsScreen', {
      query,
      results,
      exampleCount: count,
      learner: { frequency: null, sort: 'default', filter: 'all', known: [], leadingOnly: false }
    })
    const row = screen.state === 'results' ? screen.examples : null
    const examples = await app.text<EmbeddedSentence[]>('resultsExamples', listed)

    const observed: Omit<ExampleSearchCase, 'query' | 'covers'> = {
      ...(row ? { title: row.title } : {}),
      count,
      ...(results.primaryEntry ? { highlightedEntry: results.primaryEntry } : {}),
      usesPrimaryEntryExamples: results.usesPrimaryEntryExamples,
      ids: examples.map(example => example.id),
      shown: await shownAsTheAppLinks(
        app,
        examples.slice(0, suite.tokenLimit),
        { query, highlightedEntry: results.primaryEntry },
        'queryMatch'
      )
    }
    const { query: _query, covers: _covers, ...recorded } = expected
    expect(observed).toEqual(recorded)
    if (row) expect(row.highlightedEntry ?? undefined).toBe(recorded.highlightedEntry)
  })

  test('counts a query’s examples before its search has answered, as the results screen asks', async () => {
    expect(await app.text<number>('exampleCount', '勉強')).toBe(51)
    expect(await app.text<number>('exampleCount', 'qzxvkj')).toBe(0)
    expect(await app.text<number>('exampleCount', '"')).toBe(0)
  })
})

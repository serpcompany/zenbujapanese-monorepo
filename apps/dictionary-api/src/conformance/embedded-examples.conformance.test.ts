import { examplesPerPage } from '@zenbu/dictionary-core/detail/examples'
import type { EmbeddedSearchResults } from '@zenbu/dictionary-core/embedded/lookup'
import type { EmbeddedResultsExamples, EmbeddedToken } from '@zenbu/dictionary-core/embedded/text'
import type { LearnerResultsScreen } from '@zenbu/dictionary-core/results/learner'
import { beforeAll, describe, expect, test } from 'vitest'
import { type Embedded, embedded, everyPage, shownAsTheAppLinks } from './embedded-support'
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
      learner: { sort: 'default', filter: 'all', known: [], fromRadicals: false }
    })
    const row = screen.state === 'results' ? screen.examples : null
    const { first, examples } = await everyPage(from =>
      app.text<EmbeddedResultsExamples>('resultsExamples', { ...listed, from })
    )
    const { countText } = first

    const observed: Omit<ExampleSearchCase, 'query' | 'covers'> = {
      ...(row ? { title: row.title } : {}),
      count,
      ...(countText ? { countText } : {}),
      ...(results.primaryEntry ? { highlightedEntry: results.primaryEntry } : {}),
      usesPrimaryEntryExamples: results.usesPrimaryEntryExamples,
      ids: examples.map(example => example.id),
      shown: shownAsTheAppLinks(examples.slice(0, suite.tokenLimit), 'queryMatch')
    }
    const { query: _query, covers: _covers, ...recorded } = expected
    expect(observed).toEqual(recorded)
    expect(first.examples.length, 'a page of examples, linked in the one answer').toBe(
      Math.min(recorded.ids.length, examplesPerPage)
    )
    if (row) expect(row.highlightedEntry ?? undefined).toBe(recorded.highlightedEntry)
  })

  test('accepts the example index and the word index the app bundles', async () => {
    expect(await app.text<boolean>('checkExamples', '')).toBe(true)
  })

  test('counts a query’s examples before its search has answered, as the results screen asks', async () => {
    expect(await app.text<number>('exampleCount', '勉強')).toBe(51)
    expect(await app.text<number>('exampleCount', 'qzxvkj')).toBe(0)
    expect(await app.text<number>('exampleCount', '"')).toBe(0)
  })

  test('counts, in one call on an engine that has linked nothing, the words the suite’s sentences link to one entry that are no function word', async () => {
    const lines = suite.cases.flatMap(listed => listed.shown.map(shown => shown.japanese))
    const counted = await (await embedded()).text<string[]>('countedWords', lines)
    const linked: string[] = []
    for (const text of lines) {
      const tokens = await app.text<EmbeddedToken[]>('linkedTokens', {
        text,
        query: '',
        highlightedEntry: null
      })
      for (const token of tokens) {
        if (token.entry !== null && !token.isFunctionWord) linked.push(token.entry)
      }
    }
    expect(counted).toEqual(linked)
    expect(counted).toHaveLength(611)
    expect(new Set(counted).size).toBe(296)
  })
})

import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import type { EmbeddedSearchResults } from '@zenbu/dictionary-core/embedded/lookup'
import { lookupSegments, type MorphologyAnalyzer } from '@zenbu/dictionary-core/search/morphology'
import { normalizeQuery } from '@zenbu/dictionary-core/search/query'
import { beforeAll, describe, expect, test } from 'vitest'
import { sudachiContract } from '../sudachi'
import { type Embedded, embedded } from './embedded-support'
import {
  artifactAvailable,
  dictionary,
  readSuite,
  requirePinnedArtifacts,
  resources,
  sudachiAnalyzer,
  sudachiAvailable
} from './support'

interface RecordedResult {
  id: string
  headword: string
  reading: string
}

interface SentenceCase {
  covers: string
  query: string
  words: unknown[]
  searched: string[]
  resolution: string
  presentation: string
  results: RecordedResult[]
}

const suite = readSuite<{
  artifacts: { name: string; sha256: string }[]
  resultLimit: number
  cases: SentenceCase[]
}>('sentence-search')

const recorded = (found: {
  resolution: string
  presentation: string
  results: RecordedResult[]
}) => ({
  resolution: found.resolution,
  presentation: found.presentation,
  results: (found.presentation === 'discoveredWords'
    ? found.results
    : found.results.slice(0, suite.resultLimit)
  ).map(({ id, headword, reading }) => ({ id, headword, reading }))
})

const expected = ({ resolution, presentation, results }: SentenceCase) => ({
  resolution,
  presentation,
  results
})

describe.runIf(artifactAvailable && sudachiAvailable)('sentence search conformance', () => {
  let analyzer: MorphologyAnalyzer
  let service: Dictionary
  let app: Embedded

  beforeAll(async () => {
    requirePinnedArtifacts(suite.artifacts)
    analyzer = sudachiAnalyzer() as MorphologyAnalyzer
    service = await dictionary({ morphology: true })
    app = await embedded(analyzer)
  })

  test('was recorded with the Sudachi dictionary the app pins', () => {
    expect(suite.artifacts.find(artifact => artifact.name === 'system_core.dic')?.sha256).toBe(
      sudachiContract(resources).installedSHA256
    )
  })

  test.each(
    suite.cases
  )('Sudachi gives the service 「$query」 as it gives the app, and the core searches the same words', async recordedCase => {
    const { words } = await analyzer.analyze(normalizeQuery(recordedCase.query))
    expect(words).toEqual(recordedCase.words)
    expect(lookupSegments(words)).toEqual(recordedCase.searched)
  })

  test.each(
    suite.cases
  )('the service finds for 「$query」 what the app finds', async recordedCase => {
    const found = await service.searchResults(recordedCase.query)
    expect(
      recorded({
        ...found,
        results: found.items.map(({ entry }) => entry)
      })
    ).toEqual(expected(recordedCase))
  })

  test.each(
    suite.cases
  )('the app’s entry point finds for 「$query」 what the app finds', async recordedCase => {
    const found = await app.lookup<EmbeddedSearchResults>('search', recordedCase.query)
    expect(recorded({ ...found, results: found.items })).toEqual(expected(recordedCase))
    expect(
      await app.lookup<string[]>('searchedWords', JSON.stringify({ words: recordedCase.words }))
    ).toEqual(recordedCase.searched)
  })
})

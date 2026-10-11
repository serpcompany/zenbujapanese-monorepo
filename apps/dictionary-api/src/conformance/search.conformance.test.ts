import { searchDatabase } from '@zenbu/dictionary-core/artifact/database'
import { DictionarySearch } from '@zenbu/dictionary-core/search/search'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  describeEntries,
  expectRecordedRetrieval,
  needsAnalyzer,
  retrievalSuite as suite
} from './retrieval-suite'
import {
  artifactAvailable,
  artifactDatabase,
  requirePinnedArtifacts,
  sudachiAnalyzer,
  sudachiAvailable
} from './support'

const runnable = suite.cases.filter(expected => sudachiAvailable || !needsAnalyzer(expected))
const skipped = suite.cases.filter(expected => !sudachiAvailable && needsAnalyzer(expected))

describe.runIf(artifactAvailable)('search conformance', () => {
  let search: DictionarySearch

  beforeAll(async () => {
    requirePinnedArtifacts([suite.artifact])
    search = new DictionarySearch(searchDatabase(await artifactDatabase()), {
      morphology: sudachiAnalyzer()
    })
  })

  test.each(runnable)('「$query」', async expected => {
    const results = await search.search(expected.query)
    const observed = results.items.slice(0, suite.resultLimit).map(item => item.entry)
    expectRecordedRetrieval(expected, {
      ...results,
      ids: observed.map(entry => entry.id),
      found: describeEntries(observed)
    })
  })

  if (skipped.length > 0) {
    test.skip.each(skipped)('「$query」 needs Sudachi (pnpm sudachi)', () => {})
  }

  test("a word JMdict lists twice, as 欧州経済領域, keeps its lower Language Reference ID's entry number, whichever query finds it", async () => {
    for (const query of ['欧州経済領域', 'european economic area']) {
      const item = (await search.search(query)).items.find(
        candidate => candidate.entry.headword === '欧州経済領域'
      )
      expect(item?.entry, query).toMatchObject({
        id: '4e9c02a00a028f7ea45ab9cc687ec4cf',
        sourceRecordId: 5149361
      })
    }
  })
})

import { formLookup } from '@zenbu/dictionary-core/artifact/lookup'
import type { EmbeddedSearchResults } from '@zenbu/dictionary-core/embedded/lookup'
import type { LinkEntry } from '@zenbu/dictionary-core/examples/linking'
import { beforeAll, describe, expect, test } from 'vitest'
import { type Embedded, embedded } from './embedded-support'
import { expectRecordedRetrieval, needsAnalyzer, retrievalSuite as suite } from './retrieval-suite'
import { artifactAvailable, artifactDatabase, readSuite, requirePinnedArtifacts } from './support'

const withoutAnalyzer = suite.cases.filter(expected => !needsAnalyzer(expected))

interface KanjiSuite {
  artifacts: { name: string; sha256: string }[]
  cases: { character: string; codePoint: string; words?: { id: string }[] }[]
}

const kanjiSuite = readSuite<KanjiSuite>('kanji-detail')
const kanjiWithWords = kanjiSuite.cases.filter(expected => expected.words !== undefined)

describe.runIf(artifactAvailable)('the embedded dictionary on the artifact', () => {
  let app: Embedded
  const ask = <Answer>(method: string, argument: string) => app.lookup<Answer>(method, argument)

  beforeAll(async () => {
    requirePinnedArtifacts([suite.artifact, ...kanjiSuite.artifacts])
    app = await embedded()
  })

  test.each(withoutAnalyzer)('searches 「$query」 as the suite records', async expected => {
    const results = await ask<EmbeddedSearchResults>('search', expected.query)
    const ids = results.items.map(item => item.id)
    expectRecordedRetrieval(expected, { ...results, ids, found: ids.join(', ') })
  })

  test.each(
    kanjiWithWords
  )('lists the words of $codePoint $character as the suite records', async expected => {
    expect(await ask<string[]>('entriesContainingKanji', expected.character)).toEqual(
      expected.words?.map(word => word.id)
    )
  })

  test('finds exact forms in Japanese and in romaji, as the linked words’ lookup finds them', async () => {
    const forms = ['食べる', 'taberu', '食べた', 'いる', '日本', 'はし']
    const found = await ask<Record<string, LinkEntry[]>>(
      'entriesMatchingFirstForms',
      JSON.stringify(forms.map(form => [form]))
    )
    const lookup = formLookup(await artifactDatabase())
    for (const form of forms.filter(form => form !== 'taberu')) {
      expect(found[form], form).toEqual(lookup(form))
    }
    expect(found.食べる.length).toBeGreaterThan(0)
    expect(found.taberu.map(entry => entry.id)).toContain(found.食べる[0].id)
    expect(found.食べた).toEqual([])
    expect(found.いる.length).toBeGreaterThan(1)
  })

  test('stops at the first of a word’s forms that has entries', async () => {
    const found = await ask<Record<string, LinkEntry[]>>(
      'entriesMatchingFirstForms',
      JSON.stringify([
        ['食べた', '食べる', 'たべる'],
        ['ゐゑ', 'ヰヱ']
      ])
    )
    expect(Object.keys(found).sort()).toEqual(['ゐゑ', 'ヰヱ', '食べた', '食べる'])
    expect(found.食べる.length).toBeGreaterThan(0)
    expect([found.食べた, found.ゐゑ, found.ヰヱ]).toEqual([[], [], []])
  })
})

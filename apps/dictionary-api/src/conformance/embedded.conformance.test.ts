import type { ArtifactDatabase, SqlValue } from '@zenbu/dictionary-core/artifact/database'
import { formLookup } from '@zenbu/dictionary-core/artifact/lookup'
import {
  EmbeddedDictionary,
  type EmbeddedEndpoint,
  type EmbeddedSearchResults,
  embeddedEndpoint,
  type HostRows
} from '@zenbu/dictionary-core/embedded/dictionary'
import type { LinkEntry } from '@zenbu/dictionary-core/examples/linking'
import { beforeAll, describe, expect, test } from 'vitest'
import { expectRecordedRetrieval, needsAnalyzer, retrievalSuite as suite } from './retrieval-suite'
import { artifactAvailable, artifactDatabase, readSuite, requirePinnedArtifacts } from './support'

const withoutAnalyzer = suite.cases.filter(expected => !needsAnalyzer(expected))

interface KanjiSuite {
  artifacts: { name: string; sha256: string }[]
  cases: { character: string; codePoint: string; words?: { id: string }[] }[]
}

const kanjiSuite = readSuite<KanjiSuite>('kanji-detail')
const kanjiWithWords = kanjiSuite.cases.filter(expected => expected.words !== undefined)

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')

function answering(db: ArtifactDatabase) {
  return (sql: string, parametersJSON: string): HostRows => {
    try {
      const rows = db.all<Record<string, unknown>>(sql, JSON.parse(parametersJSON) as SqlValue[])
      const blobs = new Set<string>()
      for (const row of rows) {
        for (const [column, value] of Object.entries(row)) {
          if (!(value instanceof Uint8Array)) continue
          blobs.add(column)
          row[column] = hex(value)
        }
      }
      return { rows, blobs: [...blobs] }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }
}

describe.runIf(artifactAvailable)('the embedded dictionary on the artifact', () => {
  let endpoint: EmbeddedEndpoint

  beforeAll(async () => {
    requirePinnedArtifacts([suite.artifact, ...kanjiSuite.artifacts])
    endpoint = embeddedEndpoint(
      new EmbeddedDictionary({ all: answering(await artifactDatabase()) })
    )
  })

  async function ask<Answer>(method: string, argument: string): Promise<Answer> {
    const call = endpoint.begin(method, argument)
    const settled = async () => {
      await new Promise(resolve => setTimeout(resolve))
      return JSON.parse(call.outcome()) as { value?: Answer; error?: string; analyze?: string }
    }
    let outcome = await settled()
    if (outcome.analyze !== undefined) {
      call.analyzed(JSON.stringify({ error: 'This host has no analyzer' }))
      outcome = await settled()
    }
    if (outcome.error !== undefined) throw new Error(outcome.error)
    return outcome.value as Answer
  }

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

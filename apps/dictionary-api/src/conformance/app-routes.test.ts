import { readFileSync } from 'node:fs'
import type { WordCard } from '@zenbu/dictionary-core/cards/card'
import type { SegmentedToken } from '@zenbu/dictionary-core/cards/segmentation'
import type { RecordedWord } from '@zenbu/dictionary-core/cards/suite'
import type { Hono } from 'hono'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { createApp } from '../app'
import { inProcessService } from '../service'
import { type TestAccountKeys, testAccountKeys } from './account-keys'
import { expectCardsAsRecorded } from './cards'
import { artifactAvailable, browse, dictionary, readSuite, requirePinnedArtifacts } from './support'

interface RecordedSentence {
  japanese: string
  tokens: { surface: string; entry?: string; candidates?: string[] }[]
}

interface RecordedForms {
  examples?: { shown: RecordedSentence[] }
}

const wordSuite = readSuite<{
  artifacts: { name: string; sha256: string }[]
  cases: (RecordedWord & {
    covers: string
    conjugations?: { plain: RecordedForms[]; polite?: RecordedForms[] }
  })[]
}>('word-detail')

const recordedSentences = [
  ...new Map(
    wordSuite.cases
      .flatMap(word => [...(word.conjugations?.plain ?? []), ...(word.conjugations?.polite ?? [])])
      .flatMap(form => form.examples?.shown ?? [])
      .map(sentence => [sentence.japanese, sentence] as const)
  ).values()
]

const { release } = JSON.parse(
  readFileSync(new URL('../../../../language-data/release.json', import.meta.url), 'utf8')
) as { release: string }

describe.runIf(artifactAvailable)('the app routes on the app’s data', () => {
  let app: Hono
  let keys: TestAccountKeys
  const sha256 =
    wordSuite.artifacts.find(file => file.name === 'LanguageReferenceData.sqlite3')?.sha256 ?? ''
  const languageData = { release, file: 'LanguageReferenceData.sqlite3', sha256 }

  beforeAll(async () => {
    requirePinnedArtifacts(wordSuite.artifacts)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    keys = await testAccountKeys()
    const service = inProcessService(await dictionary({ morphology: false }), await browse(), {
      build: 'conformance',
      artifact: { name: languageData.file, sha256 },
      languageData,
      features: { sentenceSearch: false }
    })
    app = createApp({
      service,
      token: 'service-token-0123456789',
      ready: () => true,
      access: keys.access({ limit: 100_000 })
    })
  })

  const answer = async <Answer>(path: string) => {
    const response = await app.request(
      new Request(`http://localhost${path}`, {
        headers: { authorization: `Bearer ${await keys.accessToken()}` }
      })
    )
    expect(response.status, path).toBe(200)
    return (await response.json()) as Answer & { languageData: typeof languageData }
  }

  test('word cards hold what the word-detail suite records for each of its words', async () => {
    const ids = wordSuite.cases.map(word => word.languageReferenceID)
    const answered = await answer<{ cards: WordCard[]; missing: string[] }>(
      `/v1/apps/word-cards?ids=${ids.join(',')}`
    )
    expect(answered.languageData).toEqual(languageData)
    expect(answered.missing).toEqual([])
    expectCardsAsRecorded(answered.cards, wordSuite.cases)
  })

  test('segmentation splits each recorded sentence into the words the suite links', async () => {
    expect(recordedSentences.length).toBeGreaterThan(500)
    for (const sentence of recordedSentences) {
      const answered = await answer<{ tokens: SegmentedToken[] }>(
        `/v1/apps/segmentation?text=${encodeURIComponent(sentence.japanese)}`
      )
      expect(
        answered.tokens.map(token => ({
          surface: token.text,
          ...(token.languageReferenceID ? { entry: token.languageReferenceID } : {}),
          ...(token.candidates ? { candidates: token.candidates } : {})
        })),
        sentence.japanese
      ).toEqual(
        sentence.tokens.map(({ surface, entry, candidates }) => ({
          surface,
          ...(entry ? { entry } : {}),
          ...(candidates ? { candidates } : {})
        }))
      )
    }
  })
})

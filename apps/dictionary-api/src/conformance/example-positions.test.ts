import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { examplesPerPage } from '@zenbu/dictionary-core/detail/examples'
import type { Hono } from 'hono'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { createApp } from '../app'
import { inProcessService } from '../service'
import { wordSuite } from './detail-suite'
import { exampleSearchSuite } from './example-search-suite'
import { info } from './fake-service'
import {
  artifactAvailable,
  artifactRadicals,
  browse,
  dictionary,
  requirePinnedArtifacts
} from './support'

const token = 'service-token-0123456789'

function recordedWord(headword: string) {
  const found = wordSuite.cases.find(word => word.covers.startsWith(`${headword}:`))
  if (!found) throw new Error(`The word-detail suite has no ${headword}`)
  return { entSeq: Number(found.entSeq[0]), listed: found.examples.listed }
}

function recordedSearch(query: string) {
  const found = exampleSearchSuite.cases.find(search => search.query === query)
  if (!found) throw new Error(`The example-search suite has no ${query}`)
  return found.ids
}

const toru = recordedWord('取る')
const noExamples = recordedWord('蟋蟀')
const minai = recordedSearch('見ない')

describe.runIf(artifactAvailable)('a position past the examples listed, on the app’s data', () => {
  let service: Dictionary
  let app: Hono

  beforeAll(async () => {
    requirePinnedArtifacts([...wordSuite.artifacts, ...exampleSearchSuite.artifacts])
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    service = await dictionary({ morphology: false })
    app = createApp({
      service: inProcessService(service, await browse(), info, await artifactRadicals()),
      token,
      ready: () => true
    })
  })

  test('a word lists its last example at its last position, past 100, and none after it', () => {
    expect(toru.listed).toBeGreaterThan(100)
    const last = service.wordExamples(toru.entSeq, toru.listed - 1)
    expect(last?.rows.map(row => row.example.position)).toEqual([toru.listed - 1])
    expect(service.wordExamples(toru.entSeq, toru.listed)).toBeNull()
  })

  test('a word with no examples still answers an empty first page', () => {
    expect(noExamples.listed).toBe(0)
    expect(service.wordExamples(noExamples.entSeq, 0)).toEqual({ rows: [], slugs: {} })
  })

  test('a search lists its last sentence at its last position, past 100, and none after it', async () => {
    expect(minai.length).toBeGreaterThan(100)
    const last = await service.searchExamples('見ない', minai.length - 1)
    expect(last?.listed).toBe(minai.length)
    expect(last?.rows.map(({ sentence }) => `esp1_${sentence.pairId}`)).toEqual([minai.at(-1)])
    expect(await service.searchExamples('見ない', minai.length)).toBeNull()
  })

  test('the examples route answers 404 past a word’s list and its rows at the last page', async () => {
    const examples = (from: number) =>
      app.request(
        new Request(`http://localhost/v1/words/${toru.entSeq}/examples?from=${from}`, {
          headers: { authorization: `Bearer ${token}` }
        })
      )
    const lastPage = Math.floor((toru.listed - 1) / examplesPerPage) * examplesPerPage
    const listed = await examples(lastPage)
    expect(listed.status).toBe(200)
    expect(((await listed.json()) as { rows: unknown[] }).rows).toHaveLength(toru.listed - lastPage)
    expect((await examples(toru.listed)).status).toBe(404)
  })
})

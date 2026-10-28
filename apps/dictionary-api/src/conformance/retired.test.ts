import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { maximumPagesAsked } from '@zenbu/dictionary-core/artifact/pages'
import type { RetiredEntriesFile } from '@zenbu/dictionary-core/artifact/retired'
import { describe, expect, test, vi } from 'vitest'
import {
  artifactAvailable,
  dictionary,
  retiredEntriesPath,
  serviceOnTheData,
  serviceToken as token
} from './support'

describe.runIf(artifactAvailable)('/v1/retired on the app’s data', () => {
  test('answers the entries the committed release retires, made for this artifact', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const file = JSON.parse(readFileSync(retiredEntriesPath, 'utf8')) as RetiredEntriesFile
    const app = await serviceOnTheData(await dictionary({ morphology: false }))
    const response = await app.request(
      new Request('http://localhost/v1/retired', { headers: { authorization: `Bearer ${token}` } })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      Object.fromEntries(file.entries.map(entry => [String(entry.ent_seq), entry.replacement]))
    )
  })
})

const languageReferenceId = (entSeq: number) =>
  createHash('sha256').update(`edrdg.jmdict\0${entSeq}`).digest('hex').slice(0, 32)

describe.runIf(artifactAvailable)('/v1/pages on the app’s data', () => {
  test('answers a word’s page and a kanji’s, and none for a retired entry or a kana', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const file = JSON.parse(readFileSync(retiredEntriesPath, 'utf8')) as RetiredEntriesFile
    const taberu = languageReferenceId(1358280)
    const retired = file.entries
      .slice(0, maximumPagesAsked - 1)
      .map(entry => languageReferenceId(entry.ent_seq))
    const app = await serviceOnTheData(await dictionary({ morphology: false }))
    const response = await app.request(
      new Request(
        `http://localhost/v1/pages?words=${[taberu, ...retired].join(',')}&kanji=${encodeURIComponent('日,あ')}`,
        { headers: { authorization: `Bearer ${token}` } }
      )
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      words: [{ languageReferenceID: taberu, entSeq: 1358280, slug: '食べる' }],
      kanji: ['日']
    })
  })
})

import { DictionaryBrowse } from '@zenbu/dictionary-core/artifact/browse'
import type { ArtifactDatabase } from '@zenbu/dictionary-core/artifact/database'
import { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import type { KanjiData } from '@zenbu/dictionary-core/artifact/kanji-data'
import { type RetiredEntriesFile, retiredEntries } from '@zenbu/dictionary-core/artifact/retired'
import { describe, expect, test, vi } from 'vitest'
import { createApp } from './app'
import { info } from './conformance/fake-service'
import { inProcessService } from './service'

const token = 'test-token-0123456789'
const languageData = 'a'.repeat(64)
const unread: ArtifactDatabase = {
  all: () => {
    throw new Error('the retired entries come from their file, not the artifact')
  }
}
const kanji = {} as KanjiData

const secondRelease: RetiredEntriesFile = {
  schema: 'zenbu.retired-entries.v1',
  language_data_sha256: languageData,
  entries: [
    { ent_seq: 1000220, retired_in: '2026.11.1', replacement: 1000230 },
    { ent_seq: 2830705, retired_in: '2026.11.1', replacement: null }
  ]
}

function retiredRoute(file: RetiredEntriesFile) {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const dictionary = new Dictionary({
    db: unread,
    kanji,
    retired: retiredEntries(file, languageData),
    capabilities: { tokenize: () => [] }
  })
  const service = inProcessService(dictionary, new DictionaryBrowse(unread, kanji), info)
  return createApp({ service, token, ready: () => true }).request(
    new Request('http://localhost/v1/retired', { headers: { authorization: `Bearer ${token}` } })
  )
}

describe('/v1/retired', () => {
  test("answers each entry the release's file retires, with its replacement or null", async () => {
    const response = await retiredRoute(secondRelease)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ '1000220': 1000230, '2830705': null })
  })

  test('answers nothing for a release that retires nothing', async () => {
    expect(await (await retiredRoute({ ...secondRelease, entries: [] })).json()).toEqual({})
  })
})

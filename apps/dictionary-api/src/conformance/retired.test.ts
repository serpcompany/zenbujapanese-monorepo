import { readFileSync } from 'node:fs'
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

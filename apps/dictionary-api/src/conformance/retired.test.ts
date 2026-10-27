import { readFileSync } from 'node:fs'
import type { RetiredEntriesFile } from '@zenbu/dictionary-core/artifact/retired'
import { describe, expect, test, vi } from 'vitest'
import { createApp } from '../app'
import { inProcessService } from '../service'
import { info } from './fake-service'
import {
  artifactAvailable,
  artifactRadicals,
  browse,
  dictionary,
  retiredEntriesPath
} from './support'

const token = 'service-token-0123456789'

describe.runIf(artifactAvailable)('/v1/retired on the app’s data', () => {
  test('answers the entries the committed release retires, made for this artifact', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const file = JSON.parse(readFileSync(retiredEntriesPath, 'utf8')) as RetiredEntriesFile
    const service = inProcessService(
      await dictionary({ morphology: false }),
      await browse(),
      info,
      await artifactRadicals()
    )
    const app = createApp({ service, token, ready: () => true })
    const response = await app.request(
      new Request('http://localhost/v1/retired', { headers: { authorization: `Bearer ${token}` } })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      Object.fromEntries(file.entries.map(entry => [String(entry.ent_seq), entry.replacement]))
    )
  })
})

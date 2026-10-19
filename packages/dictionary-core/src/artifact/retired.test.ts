import { describe, expect, test } from 'vitest'
import { type RetiredEntriesFile, retiredEntries } from './retired'

const languageData = 'a'.repeat(64)

const file = (overrides: Partial<RetiredEntriesFile> = {}): RetiredEntriesFile => ({
  schema: 'zenbu.retired-entries.v1',
  language_data_sha256: languageData,
  entries: [
    { ent_seq: 1000220, retired_in: '2026.11.1', replacement: 1000230 },
    { ent_seq: 2830705, retired_in: '2026.11.1', replacement: null }
  ],
  ...overrides
})

describe('retiredEntries', () => {
  test("maps each retired entry to its replacement, or to null when it's gone", () => {
    expect(retiredEntries(file(), languageData)).toEqual({ 1000220: 1000230, 2830705: null })
  })

  test('is empty for a release that retires nothing', () => {
    expect(retiredEntries(file({ entries: [] }), languageData)).toEqual({})
  })

  test('refuses another format', () => {
    expect(() =>
      retiredEntries(file({ schema: 'zenbu.retired-entries.v2' }), languageData)
    ).toThrow(
      'RetiredEntries.json is zenbu.retired-entries.v2; the core reads zenbu.retired-entries.v1'
    )
  })

  test('refuses a file made for another language-reference database', () => {
    expect(() => retiredEntries(file(), 'b'.repeat(64))).toThrow(
      `RetiredEntries.json was made for LanguageReferenceData ${languageData}, not ${'b'.repeat(64)}`
    )
  })
})

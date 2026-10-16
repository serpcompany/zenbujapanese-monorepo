import { describe, expect, test } from 'vitest'
import { emailLanguage, languageOf } from './language'

const malformed = ['JA', 'ja-JP', 'ja,en', ' ja', 'ja;q=1', '', 'japanese', 1, true, {}, ['ja']]

describe("an email's language", () => {
  test('is English when the request names none and the account has none', () => {
    expect(emailLanguage(null, null)).toBe('en')
    expect(emailLanguage(undefined, undefined)).toBe('en')
  })

  test('is the language the request names, when it is English or Japanese', () => {
    expect(emailLanguage('en', null)).toBe('en')
    expect(emailLanguage('ja', null)).toBe('ja')
    expect(emailLanguage('en', 'ja')).toBe('en')
    expect(emailLanguage('ja', 'en')).toBe('ja')
  })

  test("is the account's language when the request names none", () => {
    expect(emailLanguage(null, 'ja')).toBe('ja')
    expect(emailLanguage(null, 'en')).toBe('en')
  })

  test('takes an unknown language as none, so it is English unless the account has one', () => {
    for (const unknown of ['fr', 'de', 'zh', 'es']) {
      expect(languageOf(unknown), unknown).toBeNull()
      expect(emailLanguage(unknown, null), unknown).toBe('en')
      expect(emailLanguage(unknown, 'ja'), unknown).toBe('ja')
    }
  })

  test('takes a malformed one as none, whatever its shape', () => {
    for (const value of malformed) {
      expect(languageOf(value), String(value)).toBeNull()
      expect(emailLanguage(value, null), String(value)).toBe('en')
    }
  })

  test('never takes a stored value it does not know', () => {
    expect(emailLanguage(null, 'fr')).toBe('en')
    expect(emailLanguage(null, 'JA')).toBe('en')
  })
})

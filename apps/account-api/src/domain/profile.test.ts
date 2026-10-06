import { describe, expect, test } from 'vitest'
import { editedProfile, normalizeName, normalizeUsername } from './profile'

const invalid = { code: 'invalid_fields', message: expect.any(String) }

describe('a name', () => {
  test('is trimmed, its runs of spaces made one, and stored in NFC', () => {
    expect(normalizeName('  Kana \t  Fan ')).toBe('Kana Fan')
    expect(normalizeName('José')).toBe('José')
    expect(normalizeName('全部')).toBe('全部')
  })

  test('is 1 to 100 characters, with no control or invisible format characters', () => {
    expect(normalizeName('x'.repeat(100))).toBe('x'.repeat(100))
    expect(normalizeName('語'.repeat(100))).toBe('語'.repeat(100))
    for (const refused of ['', '   ', 'x'.repeat(101), 'a\u0000b', 'a​b', 42, null]) {
      expect(normalizeName(refused), String(refused)).toEqual(invalid)
    }
  })
})

describe('a username', () => {
  test('is NFKC, trimmed, and lowercased before it is checked', () => {
    expect(normalizeUsername(' Kana_Fan ')).toBe('kana_fan')
    expect(normalizeUsername('ＫＡＮＡ＿１')).toBe('kana_1')
    expect(normalizeUsername(null)).toBeNull()
  })

  test('is 3 to 30 letters a to z, digits, or underscores', () => {
    expect(normalizeUsername('abc')).toBe('abc')
    expect(normalizeUsername('a'.repeat(30))).toBe('a'.repeat(30))
    for (const refused of ['ab', 'a'.repeat(31), 'kana-fan', 'kana fan', 'かな', 'é_fan', 7]) {
      expect(normalizeUsername(refused), String(refused)).toEqual(invalid)
    }
  })
})

describe('an edit', () => {
  const current = { name: 'Kana', username: 'kana' }

  test('changes only the fields it names', () => {
    expect(editedProfile(current, { name: ' Kanji ' })).toEqual({ name: 'Kanji', username: 'kana' })
    expect(editedProfile(current, { username: null })).toEqual({ name: 'Kana', username: null })
  })

  test('names at least one field, and only the name and username', () => {
    expect(editedProfile(current, {})).toEqual(invalid)
    expect(editedProfile(current, { email: 'other@example.com' })).toEqual({
      code: 'invalid_fields',
      message: 'Only name and username can change, not email.'
    })
    expect(editedProfile(current, { name: 'Kana', version: 9 })).toEqual(invalid)
  })
})

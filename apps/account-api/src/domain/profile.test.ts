import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { editedProfile, normalizeName, normalizeUsername, profileLimits } from './profile'

const invalid = { code: 'invalid_fields', message: expect.any(String) }

interface TypedUsername {
  covers: string
  typed: string
}

const usernames = JSON.parse(
  readFileSync(new URL('./username-cases.json', import.meta.url), 'utf8')
) as {
  rule: string
  accepted: (TypedUsername & { username: string })[]
  refused: TypedUsername[]
}

const typedLengths = (cases: readonly TypedUsername[]) => cases.map(({ typed }) => typed.length)

describe('a name', () => {
  test('is trimmed, its runs of spaces made one, and stored in NFC', () => {
    expect(normalizeName('  Kana \t  Fan ')).toBe('Kana Fan')
    expect(normalizeName('José')).toBe('José')
    expect(normalizeName('全部')).toBe('全部')
  })

  test('is 1 to 100 characters, with no control or invisible format characters', () => {
    expect(normalizeName('x'.repeat(100))).toBe('x'.repeat(100))
    expect(normalizeName('語'.repeat(100))).toBe('語'.repeat(100))
    for (const refused of [
      '',
      '   ',
      'x'.repeat(101),
      'a\u0000b',
      'a\u200bb',
      '\ud800ok',
      42,
      null
    ]) {
      expect(normalizeName(refused), String(refused)).toEqual(invalid)
    }
  })
})

describe('a username', () => {
  test('is accepted as the cases shared with the app say, once NFKC, trimmed, and lowercased', () => {
    for (const { covers, typed, username } of usernames.accepted) {
      expect(normalizeUsername(typed), covers).toBe(username)
    }
  })

  test('is refused, in the sentence the app shows too, as the cases shared with the app say', () => {
    const refusal = { code: 'invalid_fields', message: usernames.rule }
    for (const { covers, typed } of usernames.refused) {
      expect(normalizeUsername(typed), covers).toEqual(refusal)
    }
  })

  test('has shared cases at both ends of its length, and one past each', () => {
    const { min, max } = profileLimits.usernameLength
    expect(typedLengths(usernames.accepted)).toEqual(expect.arrayContaining([min, max]))
    expect(typedLengths(usernames.refused)).toEqual(expect.arrayContaining([min - 1, max + 1]))
  })

  test('is text, or null to remove it', () => {
    expect(normalizeUsername(null)).toBeNull()
    expect(normalizeUsername(7)).toEqual(invalid)
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

import {
  nameCases as names,
  textOf,
  usernameCases as usernames
} from '@zenbu/account-rules/test/cases'
import { describe, expect, test } from 'vitest'
import { editedProfile, normalizeName, normalizeUsername } from './profile'

const invalid = { code: 'invalid_fields', message: expect.any(String) }

describe('a name', () => {
  test('is kept as the cases shared with the app and the website say', () => {
    for (const { covers, typed, name } of names.accepted) {
      expect(normalizeName(textOf(typed)), covers).toBe(textOf(name))
    }
  })

  test('is refused, in the sentence the website shows too, as the shared cases say', () => {
    const refusal = { code: 'invalid_fields', message: names.rule }
    for (const { covers, typed } of names.refused) {
      expect(normalizeName(textOf(typed)), covers).toEqual(refusal)
    }
  })

  test('is text with no lone surrogate', () => {
    for (const refused of [`${String.fromCharCode(0xd800)}ok`, 42, null]) {
      expect(normalizeName(refused), String(refused)).toEqual(invalid)
    }
  })
})

describe('a username', () => {
  test('is accepted as the shared cases say, once NFKC, trimmed, and lowercased', () => {
    for (const { covers, typed, username } of usernames.accepted) {
      expect(normalizeUsername(textOf(typed)), covers).toBe(textOf(username))
    }
  })

  test('is refused, in the sentence the app shows too, as the shared cases say', () => {
    const refusal = { code: 'invalid_fields', message: usernames.rule }
    for (const { covers, typed } of usernames.refused) {
      expect(normalizeUsername(textOf(typed)), covers).toEqual(refusal)
    }
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

import { describe, expect, test } from 'vitest'
import {
  accountName,
  accountUsername,
  nameRule,
  profileLimits,
  removesTheUsername,
  usernameRule
} from './profile'
import { type Case, nameCases as names, textOf, usernameCases as usernames } from './test/cases'

const typedLengths = (list: readonly Case[]) => list.map(({ typed }) => [...textOf(typed)].length)

describe('a name', () => {
  test('is kept as the shared cases say', () => {
    for (const { covers, typed, name } of names.accepted) {
      expect(accountName(textOf(typed)), covers).toBe(textOf(name))
    }
  })

  test('is refused as the shared cases say, in the sentence the cases give', () => {
    for (const { covers, typed } of names.refused) {
      expect(accountName(textOf(typed)), covers).toBeNull()
    }
    expect(nameRule).toBe(names.rule)
  })

  test('refuses a lone surrogate, which only JavaScript text can hold', () => {
    expect(accountName(`${String.fromCharCode(0xd800)}ok`)).toBeNull()
  })

  test('has shared cases at its longest and one past it', () => {
    const { nameLength } = profileLimits
    expect(typedLengths(names.accepted)).toContain(nameLength)
    expect(typedLengths(names.refused)).toContain(nameLength + 1)
  })
})

describe('a username', () => {
  test('is kept and refused as the shared cases say', () => {
    for (const { covers, typed, username } of usernames.accepted) {
      expect(accountUsername(textOf(typed)), covers).toBe(textOf(username))
    }
    for (const { covers, typed } of usernames.refused) {
      expect(accountUsername(textOf(typed)), covers).toBeNull()
    }
    expect(usernameRule).toBe(usernames.rule)
  })

  test('is removed when the field is left blank, as JavaScript trims it', () => {
    for (const { covers, typed } of usernames.removes) {
      expect(removesTheUsername(textOf(typed)), covers).toBe(true)
    }
    for (const { covers, typed } of [...usernames.accepted, ...usernames.refused]) {
      if (textOf(typed).trim() !== '') expect(removesTheUsername(textOf(typed)), covers).toBe(false)
    }
  })

  test('has shared cases at both ends of its length, and one past each', () => {
    const { min, max } = profileLimits.usernameLength
    expect(typedLengths(usernames.accepted)).toEqual(expect.arrayContaining([min, max]))
    expect(typedLengths(usernames.refused)).toEqual(expect.arrayContaining([min - 1, max + 1]))
  })
})

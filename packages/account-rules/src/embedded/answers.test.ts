import { describe, expect, test } from 'vitest'
import { listNameCases, nameCases, signInCodeCases, textOf } from '../test/cases'
import { answer } from './answers'

describe('the answers the app asks for', () => {
  test("give each rule's outcome on the shared cases, as the service and the website have it", () => {
    for (const { covers, typed, name } of nameCases.accepted) {
      expect(answer('accountName', textOf(typed)), covers).toBe(textOf(name))
    }
    for (const { covers, typed } of nameCases.refused) {
      expect(answer('accountName', textOf(typed)), covers).toBeNull()
    }
    for (const { covers, typed, name } of listNameCases.accepted) {
      expect(answer('listName', textOf(typed)), covers).toBe(textOf(name))
    }
    for (const { covers, typed } of listNameCases.refused) {
      expect(answer('listName', textOf(typed)), covers).toBeNull()
    }
    for (const { covers, typed, code } of signInCodeCases.accepted) {
      expect(answer('signInCode', textOf(typed)), covers).toBe(code)
    }
  })

  test('read a watch number as a field and its value', () => {
    expect(answer('fitsTheWatch', '["position",3600.5]')).toBe(true)
    expect(answer('fitsTheWatch', '["comprehension",1.01]')).toBe(false)
  })

  test('refuse a rule they do not have, an inherited name too', () => {
    expect(() => answer('toString', '')).toThrow('The account rules have no toString')
  })
})

import { describe, expect, test } from 'vitest'
import {
  dailyListIdCases,
  listNameCases,
  nameCases,
  signInCodeCases,
  textOf,
  usernameCases,
  watchFieldCases
} from '../test/cases'
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

  test("give a daily list's ID for its day, and its day for its ID, or none", () => {
    for (const { covers, day, id } of dailyListIdCases.days) {
      expect(answer('dailyListId', day), covers).toBe(id)
      expect(answer('dailyListDay', id), covers).toBe(day)
    }
    for (const { covers, id, day } of dailyListIdCases.upperCase) {
      expect(answer('dailyListDay', id), covers).toBe(day)
    }
    for (const { covers, day } of dailyListIdCases.notDays) {
      expect(answer('dailyListId', day), covers).toBeNull()
    }
    for (const { covers, id } of dailyListIdCases.notDailyLists) {
      expect(answer('dailyListDay', id), covers).toBeNull()
    }
  })

  test('give a username to save, an empty one to remove it, or none to refuse it', () => {
    for (const { covers, typed, username } of usernameCases.accepted) {
      expect(answer('usernameToSave', textOf(typed)), covers).toBe(textOf(username))
    }
    for (const { covers, typed } of usernameCases.removes) {
      expect(answer('usernameToSave', textOf(typed)), covers).toBe('')
    }
    for (const { covers, typed } of usernameCases.refused) {
      if (textOf(typed).trim() !== '')
        expect(answer('usernameToSave', textOf(typed)), covers).toBeNull()
    }
  })

  test('mark what a whole batch of watches sends, in one answer, with only what changed spelled out', () => {
    const texts = watchFieldCases.texts.map(({ typed }) => [textOf(typed), null, 0, 0, 0])
    const numbers = watchFieldCases.numbers.map(({ field, value }) => [
      'A title',
      null,
      field === 'duration' ? value : null,
      field === 'position' ? value : null,
      field === 'comprehension' ? value : null
    ])
    const [marks = '', replacedJSON] = String(
      answer('sentWatches', JSON.stringify([...texts, ...numbers]))
    ).split('\n')
    const replaced = (replacedJSON ? JSON.parse(replacedJSON) : []) as string[]
    const fields = [...marks].map(mark => (mark === 'r' ? replaced.shift() : mark))
    expect(fields).toHaveLength((texts.length + numbers.length) * 5)
    watchFieldCases.texts.forEach(({ covers, typed, sent }, index) => {
      const kept = sent === null ? '-' : textOf(sent) === textOf(typed) ? 'k' : textOf(sent)
      expect(fields.slice(index * 5, index * 5 + 5), covers).toEqual([kept, '-', 'k', 'k', 'k'])
    })
    watchFieldCases.numbers.forEach(({ covers, field, fits }, index) => {
      const column = ['duration', 'position', 'comprehension'].indexOf(field) + 2
      expect(fields[(texts.length + index) * 5 + column], covers).toBe(fits ? 'k' : '-')
    })
  })

  test('refuse a rule they do not have, an inherited name too', () => {
    expect(() => answer('toString', '')).toThrow('The account rules have no toString')
  })
})

import { describe, expect, test } from 'vitest'
import { dailyListDay, dailyListId } from './daily-lists'
import { dailyListIdCases as cases } from './test/cases'

describe("a daily list's ID", () => {
  test('is made from its day, and gives the day back, as the shared cases say', () => {
    for (const { covers, day, id } of cases.days) {
      expect(dailyListId(day), covers).toBe(id)
      expect(dailyListDay(id), covers).toBe(day)
    }
  })

  test('reads the same in upper case', () => {
    for (const { covers, id, day } of cases.upperCase) {
      expect(dailyListDay(id), covers).toBe(day)
      expect(dailyListId(day), covers).toBe(id.toLowerCase())
    }
  })

  test('is none for a day that does not exist, and no other ID names a day', () => {
    for (const { covers, day } of cases.notDays) {
      expect(dailyListId(day), covers).toBeNull()
    }
    for (const { covers, id } of cases.notDailyLists) {
      expect(dailyListDay(id), covers).toBeNull()
    }
  })
})

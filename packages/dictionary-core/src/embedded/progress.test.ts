import { expect, test } from 'vitest'
import { progressStats } from '../progress/stats'
import { embeddedEndpoint } from './dictionary'

test('answers progress stats at once, from the log’s days as the app keeps them', () => {
  const request = {
    days: {
      '2026-10-27': {
        changes: [
          { id: '042e07f7052f611fed33ddddf37f55fd', before: 'unknown', after: 'learning', at: 1 }
        ],
        goal: 1,
        known: 0,
        learning: 1
      }
    },
    goal: 20,
    today: '2026-10-28'
  }
  const endpoint = embeddedEndpoint({})
  expect(JSON.parse(endpoint.answerJSON('progressStats', JSON.stringify(request)))).toEqual(
    progressStats(request)
  )
  expect(endpoint.answer('progressStats', JSON.stringify(request))).toMatchObject({
    streak: 1,
    today: { day: '2026-10-28', goal: 20, added: 0 }
  })
})

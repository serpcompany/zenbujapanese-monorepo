import { describe, expect, it } from 'vitest'
import { isolateHarness } from './test-env.mjs'

await isolateHarness()
const { decide, emptyLedger, note429, readLedger, recorded, refusal, youtubeRequestKind } =
  await import('./youtube-budget.mjs')

const minute = 60_000
const now = Date.parse('2026-10-28T12:00:00Z')
const loads = (ledger, kind, times) =>
  times.reduce((l, ago) => recorded(l, kind, now - ago), ledger)

describe('youtubeRequestKind', () => {
  it('counts documents and timedtext on YouTube hosts only', () => {
    expect(youtubeRequestKind('https://www.youtube.com/watch?v=x', 'Document')).toBe('page')
    expect(youtubeRequestKind('https://youtu.be/x', 'Document')).toBe('page')
    expect(youtubeRequestKind('https://www.youtube.com/api/timedtext?v=x', 'XHR')).toBe('timedtext')
    expect(youtubeRequestKind('https://www.youtube.com/s/player.js', 'Script')).toBeNull()
    expect(youtubeRequestKind('https://notyoutube.com/', 'Document')).toBeNull()
  })
})

describe('refusal', () => {
  it('allows 4 page loads an hour and refuses the fifth', () => {
    const four = loads(
      emptyLedger(),
      'page',
      [1, 2, 3, 59].map(m => m * minute)
    )
    expect(
      refusal(
        loads(
          emptyLedger(),
          'page',
          [1, 2, 3].map(m => m * minute)
        ),
        'page',
        now
      )
    ).toBeNull()
    expect(refusal(four, 'page', now)).toContain('4 YouTube page loads in the last hour')
  })

  it('refuses the eleventh page load in a day', () => {
    const ten = loads(
      emptyLedger(),
      'page',
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => h * 60 * minute)
    )
    expect(refusal(ten, 'page', now)).toContain('10 YouTube page loads in the last day')
  })

  it('allows one timedtext request every 30 minutes', () => {
    expect(refusal(loads(emptyLedger(), 'timedtext', [29 * minute]), 'timedtext', now)).toContain(
      'every 30 minutes'
    )
    expect(refusal(loads(emptyLedger(), 'timedtext', [31 * minute]), 'timedtext', now)).toBeNull()
  })

  it('refuses everything for 6 hours after a 429', () => {
    const ledger = { ...emptyLedger(), last429: new Date(now - 5 * 60 * minute).toISOString() }
    expect(refusal(ledger, 'page', now)).toContain('429')
    expect(
      refusal({ ...ledger, last429: new Date(now - 7 * 60 * minute).toISOString() }, 'page', now)
    ).toBeNull()
  })
})

describe('decide', () => {
  it('records each allowed load in the ledger and says why it refuses one', () => {
    const url = 'https://www.youtube.com/watch?v=x'
    for (let i = 0; i < 4; i++) expect(decide(url, 'Document', now + i)).toBeNull()
    expect(decide(url, 'Document', now + 5)).toContain('in the last hour')
    expect(readLedger().page).toHaveLength(4)
    expect(readLedger().lastRefusal.url).toBe(url)
  })

  it('pauses after a 429 from YouTube, not from another host', () => {
    note429('https://example.com/', now)
    expect(readLedger().last429).toBeNull()
    note429('https://www.youtube.com/watch?v=x', now)
    expect(decide('https://www.youtube.com/api/timedtext?v=x', 'XHR', now + 1)).toContain('429')
  })
})

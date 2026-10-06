import { describe, expect, test } from 'vitest'
import {
  firstSentence,
  lastChange,
  markdownTables,
  scoresToRegrade,
  summarizeDebt
} from './work-tracking'

const day = (date: string) => Date.parse(`${date}T12:00:00Z`) / 1000

describe('markdownTables', () => {
  test('reads each table under its heading, skipping the divider row', () => {
    const text = [
      '# Quality',
      '',
      '## Website',
      '',
      '| Area | Grade |',
      '| --- | --- |',
      '| Dictionary pages | B |',
      '',
      'Prose between tables.',
      '',
      '| Area | Grade |',
      '| :-- | --- |',
      '| Other pages | C |'
    ].join('\n')
    expect(markdownTables(text)).toEqual([
      { heading: 'Website', header: ['Area', 'Grade'], rows: [['Dictionary pages', 'B']] },
      { heading: 'Website', header: ['Area', 'Grade'], rows: [['Other pages', 'C']] }
    ])
  })
})

describe('lastChange', () => {
  const times = new Map([
    ['apps/web/src/lib/log.ts', day('2026-10-01')],
    ['apps/web/src/lib/dictionary/api.ts', day('2026-10-03')],
    ['apps/web/src/lib/dictionary/data.ts', day('2026-09-20')],
    ['apps/web/src/lib-old/x.ts', day('2026-10-09')]
  ])

  test("takes a file's own time, and a folder's newest file's", () => {
    expect(lastChange(times, 'apps/web/src/lib/log.ts')).toBe(day('2026-10-01'))
    expect(lastChange(times, 'apps/web/src/lib/dictionary/')).toBe(day('2026-10-03'))
    expect(lastChange(times, 'apps/web/src/lib')).toBe(day('2026-10-03'))
    expect(lastChange(times, 'apps/ios/Tools/')).toBeUndefined()
  })
})

describe('scoresToRegrade', () => {
  const quality = [
    '## Website',
    '',
    '| Area | Grade | Graded | Code | Tests |',
    '| --- | --- | --- | --- | --- |',
    '| Dictionary pages | B | 2026-09-30 | `apps/web/src/lib/dictionary/`, `apps/web/e2e/` | `x.test.ts` |',
    '| Other pages | C | 2026-10-03 | `apps/web/src/lib/pages.ts` | |',
    '| Delivery | C | soon | `apps/web/scripts/` | |',
    '',
    '| Grade | Means |',
    '| --- | --- |',
    '| A | Tests cover the behavior |'
  ].join('\n')
  const times = new Map([
    ['apps/web/src/lib/dictionary/api.ts', day('2026-10-03')],
    ['apps/web/e2e/word.spec.ts', day('2026-09-30')],
    ['apps/web/src/lib/pages.ts', day('2026-10-03')],
    ['apps/web/scripts/smoke.sh', day('2026-10-04')],
    ['x.test.ts', day('2026-10-05')]
  ])

  test('lists each row whose Code changed after the day it was graded, and only that code', () => {
    expect(scoresToRegrade(quality, times).stale).toEqual([
      {
        area: 'Dictionary pages',
        graded: '2026-09-30',
        changed: [{ path: 'apps/web/src/lib/dictionary/', day: '2026-10-03' }]
      }
    ])
  })

  test('names rows without a readable Graded date, and skips tables without both columns', () => {
    expect(scoresToRegrade(quality, times).ungraded).toEqual(['Delivery'])
  })
})

describe('summarizeDebt', () => {
  const debt = [
    '## Code',
    '',
    '| Debt | Why it matters | Issue | Size |',
    '| --- | --- | --- | --- |',
    '| Search exists twice: in `LookupClient.swift` and the core. More detail. | Drift. | #481 | large |',
    '| No linter. | Mistakes. | #516 | huge |',
    '',
    '## Harness',
    '',
    '| Debt | Why it matters | Issue | Size |',
    '| --- | --- | --- | --- |',
    '| `docs/agents/web.md` is one guide. Split it. | Slow. | #516 | small |',
    '| A token isn’t revoked. | Risk. | #379 | small |',
    '',
    '| Grade | Means |',
    '| --- | --- |',
    '| A | Fine |'
  ].join('\n')

  test('counts the open rows by size, and names the first small one', () => {
    expect(summarizeDebt(debt)).toEqual({
      open: 4,
      bySize: { small: 2, medium: 0, large: 1 },
      firstSmall: { section: 'Harness', debt: '`docs/agents/web.md` is one guide.', issue: '#516' },
      unsized: [{ section: 'Code', debt: 'No linter.', issue: '#516' }]
    })
  })

  test('has no first small item when none is small', () => {
    expect(summarizeDebt(debt.replaceAll('| small |', '| medium |')).firstSmall).toBeNull()
  })
})

describe('firstSentence', () => {
  test('stops at the first full stop outside code', () => {
    expect(firstSentence('Search exists twice: in `LookupClient.swift`. More.')).toBe(
      'Search exists twice: in `LookupClient.swift`.'
    )
    expect(firstSentence('`a. b` is code. Then more.')).toBe('`a. b` is code.')
    expect(firstSentence('No full stop')).toBe('No full stop')
  })
})

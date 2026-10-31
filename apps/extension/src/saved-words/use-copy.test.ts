import { describe, expect, it } from 'vitest'
import { syncedAgo } from './use-copy'

const at = Date.parse('2026-10-30T09:00:00Z')

describe('when the copy last synced', () => {
  it.each([
    [30_000, 'now'],
    [5 * 60_000, '5 minutes ago'],
    [3 * 3_600_000, '3 hours ago'],
    [26 * 3_600_000, 'yesterday'],
    [-5_000, 'now']
  ])('says %i milliseconds later as %s', (later, said) => {
    expect(syncedAgo(at, at + later)).toBe(said)
  })
})

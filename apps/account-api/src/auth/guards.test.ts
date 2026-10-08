import { afterEach, describe, expect, test, vi } from 'vitest'
import { codesPerEmailCounter } from './guards'

afterEach(() => vi.useRealTimers())

describe('the codes one email may get', () => {
  test('asking never uses one up: only a code sent counts toward the five', () => {
    const codes = codesPerEmailCounter()
    for (let asked = 0; asked < 20; asked++) expect(codes.secondsToWait('a@example.com')).toBe(0)
    for (let sent = 0; sent < 4; sent++) codes.sent('A@Example.com ')
    expect(codes.secondsToWait('a@example.com')).toBe(0)
    codes.sent('a@example.com')
    expect(codes.secondsToWait('a@example.com')).toBe(600)
    expect(codes.secondsToWait('b@example.com')).toBe(0)
  })

  test('says how long until the oldest of the five ages out', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const codes = codesPerEmailCounter()
    codes.sent('a@example.com')
    vi.setSystemTime(Date.now() + 4 * 60 * 1000)
    for (let sent = 0; sent < 4; sent++) codes.sent('a@example.com')
    expect(codes.secondsToWait('a@example.com')).toBe(360)
    vi.setSystemTime(Date.now() + 6 * 60 * 1000)
    expect(codes.secondsToWait('a@example.com')).toBe(0)
  })
})

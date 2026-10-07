import { describe, expect, test, vi } from 'vitest'
import { accessTokens } from './access-tokens'
import type { Result } from './client'

const jwtExpiringAt = (seconds: number) =>
  `head.${btoa(JSON.stringify({ exp: seconds })).replaceAll('=', '')}.sig`

const refusal = (status: number, code: string): Result<never> => ({
  ok: false,
  failure: { kind: 'refused', status, code, message: '', retryAfter: null, current: null }
})

describe('access tokens', () => {
  test('keeps one in memory until a minute before it expires, then gets another', async () => {
    let now = 1_000_000_000_000
    const issued = [jwtExpiringAt(now / 1000 + 900), jwtExpiringAt(now / 1000 + 1800)]
    const accessToken = vi.fn(async () => ({ ok: true as const, value: issued.shift() ?? '' }))
    const tokens = accessTokens({ accessToken }, () => now)
    const seen: string[] = []
    const use = () =>
      tokens.use(async token => {
        seen.push(token)
        return { ok: true, value: token }
      })
    await use()
    await use()
    expect(accessToken).toHaveBeenCalledTimes(1)
    now += 14 * 60_000 + 1
    await use()
    expect(accessToken).toHaveBeenCalledTimes(2)
    expect(new Set(seen).size).toBe(2)
  })

  test('on a 401, gets a new token once and asks again', async () => {
    const accessToken = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: 'first' })
      .mockResolvedValueOnce({ ok: true, value: 'second' })
    const tokens = accessTokens({ accessToken })
    const call = vi
      .fn()
      .mockResolvedValueOnce(refusal(401, 'unauthorized'))
      .mockResolvedValueOnce({ ok: true, value: 'profile' })
    expect(await tokens.use(call)).toEqual({ ok: true, value: 'profile' })
    expect(call.mock.calls).toEqual([['first'], ['second']])
  })

  test("answers the token route's 401 when the session is over, so the page shows signed out", async () => {
    const accessToken = vi.fn().mockResolvedValue(refusal(401, 'sign_in_again'))
    const call = vi.fn()
    expect(await accessTokens({ accessToken }).use(call)).toEqual(refusal(401, 'sign_in_again'))
    expect(call).not.toHaveBeenCalled()
  })

  test('forgets its token, as after signing in again, so the next one carries the new sign-in', async () => {
    const accessToken = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: 'old' })
      .mockResolvedValueOnce({ ok: true, value: 'new' })
    const tokens = accessTokens({ accessToken })
    const call = vi.fn(async (token: string) => ({ ok: true as const, value: token }))
    await tokens.use(call)
    tokens.forget()
    expect(await tokens.use(call)).toEqual({ ok: true, value: 'new' })
  })
})

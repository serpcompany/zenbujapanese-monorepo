import { describe, expect, test, vi } from 'vitest'
import { jwtFor, refusedResult as refusal } from '@/test/account-answers'
import { accessTokens } from './access-tokens'

const jwtExpiringAt = (seconds: number) => jwtFor({ exp: seconds })

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

  test("refuses a token for an account other than the page's, as when another tab signed in", async () => {
    const accessToken = vi.fn().mockResolvedValue({ ok: true, value: jwtFor({ sub: 'u2' }) })
    const tokens = accessTokens({ accessToken })
    tokens.belongTo('u1')
    const call = vi.fn()
    expect(await tokens.use(call)).toEqual(refusal(401, 'another_account'))
    expect(call).not.toHaveBeenCalled()
  })

  test('keeps no token that was being issued when it was told to forget', async () => {
    let answer: (value: { ok: true; value: string }) => void = () => {}
    const accessToken = vi
      .fn()
      .mockImplementationOnce(() => new Promise(resolve => (answer = resolve)))
      .mockResolvedValueOnce({ ok: true, value: 'after' })
    const tokens = accessTokens({ accessToken })
    const call = vi.fn(async (token: string) => ({ ok: true as const, value: token }))
    const first = tokens.use(call)
    tokens.forget()
    answer({ ok: true, value: 'before' })
    await first
    expect(await tokens.use(call)).toEqual({ ok: true, value: 'after' })
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

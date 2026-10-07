import { describe, expect, test, vi } from 'vitest'
import { jwtFor, refusedResult } from '@/test/account-answers'
import { accessTokens } from './access-tokens'
import type { AccountApi, Result } from './client'
import { isFresh, loadAccount, type SignedInAccount } from './load'

const session = { userId: 'u1', email: 'kana@example.com', signedInAt: 0, token: 'bare' }
const profile = {
  id: 'u1',
  name: '',
  username: null,
  email: 'kana@example.com',
  version: 1,
  createdAt: '2026-10-07T00:00:00.000Z'
}
const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const refused = (status: number) =>
  refusedResult(status, status === 401 ? 'unauthorized' : 'internal')

function stubApi(parts: Partial<Record<keyof AccountApi, unknown>>) {
  const answers = {
    session: ok(session),
    accessToken: ok(jwtFor({ sub: 'u1' })),
    profile: ok(profile),
    identities: ok([]),
    ...parts
  }
  return Object.fromEntries(
    Object.entries(answers).map(([name, answer]) => [name, vi.fn(async () => answer)])
  ) as unknown as AccountApi
}

const load = (api: AccountApi) => loadAccount(api, accessTokens(api))

describe('loading the account page', () => {
  test('reads the session from the cookie, then the profile with an access token and the ways in', async () => {
    expect(await load(stubApi({}))).toEqual({
      kind: 'signed-in',
      account: { session, profile, identities: [] }
    })
  })

  test('is signed out with no session, a 401 anywhere, or a session the token route refuses', async () => {
    expect(await load(stubApi({ session: ok(null) }))).toEqual({ kind: 'signed-out' })
    expect(await load(stubApi({ session: refused(401) }))).toEqual({ kind: 'signed-out' })
    expect(await load(stubApi({ accessToken: refused(401) }))).toEqual({ kind: 'signed-out' })
    expect(await load(stubApi({ identities: refused(401) }))).toEqual({ kind: 'signed-out' })
  })

  test("fails, so the page offers to try again, when the service can't answer", async () => {
    expect(await load(stubApi({ session: { ok: false, failure: { kind: 'offline' } } }))).toEqual({
      kind: 'failed',
      failure: { kind: 'offline' }
    })
    expect(await load(stubApi({ profile: refused(500) }))).toMatchObject({ kind: 'failed' })
  })

  test('counts a sign-in from the last nine minutes as fresh', () => {
    const account: SignedInAccount = { session, profile, identities: [] }
    const minute = 60_000
    expect(isFresh(account, 8 * minute)).toBe(true)
    expect(isFresh(account, 10 * minute)).toBe(false)
  })
})

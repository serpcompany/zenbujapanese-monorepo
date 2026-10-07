import { describe, expect, test, vi } from 'vitest'
import { refusedResult, stubAccountApi as stubApi } from '@/test/account-answers'
import { accessTokens } from './access-tokens'
import { afterSigningInAgain, deleteTheAccount, signedInAs } from './flows'

const previous = { userId: 'u1', email: 'kana@example.com', signedInAt: 0, token: 'old-bare' }

describe('signing in again on the account page', () => {
  test("signs this browser's earlier session out, and forgets the access token", async () => {
    const now = { ...previous, token: 'new-bare', signedInAt: 1 }
    const api = stubApi({ session: { ok: true, value: now }, revokeSession: { ok: true } })
    const tokens = accessTokens(api)
    const forget = vi.spyOn(tokens, 'forget')
    expect(await afterSigningInAgain(api, tokens, previous)).toEqual(now)
    expect(api.revokeSession).toHaveBeenCalledWith('old-bare')
    expect(forget).toHaveBeenCalled()
  })

  test("signs no session out when the browser's session is now another account's, or none", async () => {
    const someoneElse = { ...previous, userId: 'u9', token: 'their-bare' }
    const other = stubApi({ session: { ok: true, value: someoneElse }, revokeSession: {} })
    expect(await afterSigningInAgain(other, accessTokens(other), previous)).toEqual(someoneElse)
    expect(other.revokeSession).not.toHaveBeenCalled()
    const none = stubApi({ session: { ok: true, value: null }, revokeSession: {} })
    expect(await afterSigningInAgain(none, accessTokens(none), previous)).toBeNull()
    expect(none.revokeSession).not.toHaveBeenCalled()
  })

  test('tells whether the browser is still signed in to the account on the page', async () => {
    const same = stubApi({ session: { ok: true, value: previous } })
    expect(await signedInAs(same, 'u1')).toEqual({ kind: 'this-account' })
    expect(await signedInAs(same, 'u9')).toEqual({ kind: 'elsewhere' })
    const offline = stubApi({ session: { ok: false, failure: { kind: 'offline' } } })
    expect(await signedInAs(offline, 'u1')).toEqual({
      kind: 'failed',
      failure: { kind: 'offline' }
    })
  })
})

describe('deleting the account', () => {
  test('signs the browser out once deleted, and sorts each refusal for the page', async () => {
    const deleted = stubApi({
      accessToken: { ok: true, value: 'access' },
      deleteAccount: { ok: true, value: true },
      signOut: { ok: true, value: true }
    })
    expect(await deleteTheAccount(deleted, accessTokens(deleted), null)).toEqual({
      kind: 'deleted'
    })
    expect(deleted.signOut).toHaveBeenCalled()
    for (const [status, code, kind, byApple] of [
      [403, 'sign_in_again', 'confirm-first', undefined],
      [400, 'apple_authorization_invalid', 'refused', true],
      [503, 'apple_unavailable', 'refused', true],
      [500, 'internal', 'refused', false]
    ] as const) {
      const api = stubApi({
        accessToken: { ok: true, value: 'access' },
        deleteAccount: refusedResult(status, code)
      })
      expect(await deleteTheAccount(api, accessTokens(api), null), code).toMatchObject({
        kind,
        ...(byApple === undefined ? {} : { byApple })
      })
    }
  })
})

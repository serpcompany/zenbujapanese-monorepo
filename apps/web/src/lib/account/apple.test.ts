import { createHash } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import { idTokenFor } from '@/test/account-answers'
import {
  type AppleAuth,
  appleAuthorizationOf,
  appleReturnUrl,
  appleUserOf,
  sha256Hex,
  signInWithApplePopup
} from './apple'

function appleAnswering(answer: (state: string) => Promise<unknown>) {
  let config: Parameters<AppleAuth['init']>[0] | null = null
  const auth: AppleAuth = {
    init: vi.fn(given => {
      config = given
    }),
    signIn: () => answer(config?.state ?? '')
  }
  return { auth, config: () => config }
}

describe('Sign in with Apple on the website', () => {
  test("opens Apple's popup for the Services ID, with the nonce's hash and a return URL on this site", async () => {
    const apple = appleAnswering(async state => ({
      authorization: { code: 'c1', id_token: idTokenFor('001.apple'), state },
      user: { name: { firstName: 'Kana', lastName: 'Fan' }, email: 'kana@example.com' }
    }))
    const popup = await signInWithApplePopup(apple.auth, {
      clientId: 'com.zenbujapanese.web',
      nonceHash: 'hash',
      redirectURI: appleReturnUrl('https://zenbujapanese.com')
    })
    expect(apple.config()).toMatchObject({
      clientId: 'com.zenbujapanese.web',
      scope: 'name email',
      redirectURI: 'https://zenbujapanese.com/account/',
      nonce: 'hash',
      usePopup: true
    })
    expect(popup).toEqual({
      ok: true,
      authorization: {
        code: 'c1',
        idToken: idTokenFor('001.apple'),
        name: { firstName: 'Kana', lastName: 'Fan' }
      }
    })
  })

  test('refuses an answer for another state, and tells cancelling and a blocked popup apart', async () => {
    const options = { clientId: 'web', nonceHash: 'hash', redirectURI: 'https://site/account/' }
    const otherState = appleAnswering(async () => ({
      authorization: { code: 'c', id_token: 't', state: 'not-ours' }
    }))
    expect(await signInWithApplePopup(otherState.auth, options)).toEqual({
      ok: false,
      reason: 'failed'
    })
    for (const [error, reason] of [
      ['popup_closed_by_user', 'cancelled'],
      ['user_cancelled_authorize', 'cancelled'],
      ['popup_blocked_by_browser', 'blocked'],
      ['invalid_client', 'failed']
    ]) {
      const refused = appleAnswering(() => Promise.reject({ error }))
      expect(await signInWithApplePopup(refused.auth, options), error).toEqual({
        ok: false,
        reason
      })
    }
  })

  test("hashes the nonce as Apple's nonce, and reads whose Apple ID a token is", async () => {
    expect(await sha256Hex('nonce')).toBe(createHash('sha256').update('nonce').digest('hex'))
    expect(appleUserOf(idTokenFor('001.apple'))).toBe('001.apple')
    expect(appleUserOf('not-a-token')).toBeNull()
    expect(appleAuthorizationOf({ authorization: { code: 'c' } }, 's')).toBeNull()
  })
})

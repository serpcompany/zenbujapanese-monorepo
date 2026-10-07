import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AccountSettings } from '@/lib/account/settings'
import {
  answer,
  apiUrl,
  click,
  fill,
  idTokenFor,
  refusal,
  render,
  type ServiceCall,
  settle,
  shows,
  stubAccountService,
  submit,
  unmount
} from '@/test/account-page'
import { AccountView } from './account-view'

afterEach(unmount)

const email = 'kana@example.com'
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const profile = {
  id: 'u1',
  name: 'Kana Fan',
  username: 'kana_fan',
  email,
  version: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z'
}
const emailWay = { id: 'i1', providerId: 'email', accountId: email }
const appleWay = { id: 'i2', providerId: 'apple', accountId: '001.apple' }
const googleWay = { id: 'i3', providerId: 'google', accountId: '109' }

const settings = (apple = false, google = false): AccountSettings => ({
  apiUrl,
  appleServicesId: apple ? 'com.zenbujapanese.web' : null,
  google
})

function signedIn({
  signedInMinutesAgo = 1,
  ways = [emailWay],
  more = {}
}: {
  signedInMinutesAgo?: number
  ways?: object[]
  more?: Parameters<typeof stubAccountService>[0]
} = {}) {
  return stubAccountService({
    'GET /v1/auth/get-session': answer({
      user: { id: 'u1', email },
      session: { token: 'old-bare', createdAt: minutesAgo(signedInMinutesAgo) }
    }),
    'GET /v1/auth/token': [answer({ token: 'old-access' }), answer({ token: 'new-access' })],
    'GET /v1/me': answer(profile),
    'GET /v1/auth/list-accounts': answer(ways),
    'POST /v1/auth/email-otp/send-verification-otp': answer({ success: true }),
    'POST /v1/auth/sign-in/email-otp': answer({ token: 'new-bare', user: { id: 'u1' } }),
    'POST /v1/auth/revoke-session': answer({ status: true }),
    'POST /v1/auth/sign-out': answer({ success: true }),
    'DELETE /v1/me': answer({ status: 'deleted' }),
    ...more
  })
}

const callTo = (calls: ServiceCall[], route: string) => calls.filter(call => call.route === route)

async function confirmWithEmailCode(container: HTMLElement) {
  await shows(container, `We'll email a code to ${email}`)
  await submit(container, 'Email me a code')
  await shows(container, 'We sent a 6-digit code')
  await fill(container, 'Code', '123456')
  await submit(container, 'Confirm')
}

function appleAnswering(sub: string) {
  const init = vi.fn()
  vi.stubGlobal('AppleID', {
    auth: {
      init,
      signIn: async () => ({
        authorization: {
          code: `apple-code-for-${sub}`,
          id_token: idTokenFor(sub),
          state: init.mock.lastCall?.[0]?.state
        }
      })
    }
  })
  return init
}

async function deletingAnAppleAccount(more: Parameters<typeof stubAccountService>[0] = {}) {
  const service = signedIn({
    ways: [appleWay],
    more: {
      'POST /v1/auth/sign-in/nonce': answer({ nonce: 'n1', expiresIn: 600 }),
      'POST /v1/auth/sign-in/social': answer({ token: 'new-bare', user: { id: 'u1' } }),
      ...more
    }
  })
  const page = render(<AccountView settings={settings(true)} returnedError={null} />)
  await shows(page, `Signed in as ${email}`)
  await click(page, 'Delete account')
  await click(page, 'Delete my account')
  return { ...service, page }
}

describe('the account page', () => {
  test('shows who is signed in, the profile, and the ways to sign in, reading /v1/me with an access token only', async () => {
    const { calls } = signedIn({ ways: [emailWay, appleWay] })
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    expect(page.querySelector<HTMLInputElement>('#profile-name')?.value).toBe('Kana Fan')
    expect(page.querySelector<HTMLInputElement>('#profile-username')?.value).toBe('kana_fan')
    expect(page.textContent).toContain(`A code we email you (${email})`)
    expect(page.textContent).toContain('Member since October 1, 2026')
    expect(callTo(calls, 'GET /v1/me')).toEqual([
      expect.objectContaining({ credentials: 'omit', authorization: 'Bearer old-access' })
    ])
    expect(callTo(calls, 'GET /v1/auth/get-session')[0]?.credentials).toBe('include')
    expect(window.localStorage.getItem('zenbu-signed-in')).toBe('yes')
  })

  test('shows signed out, and forgets it was signed in, when there is no session', async () => {
    window.localStorage.setItem('zenbu-signed-in', 'yes')
    stubAccountService({ 'GET /v1/auth/get-session': answer(null) })
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, 'You’re not signed in.')
    expect(window.localStorage.getItem('zenbu-signed-in')).toBeNull()
  })

  test('gets a new access token once when /v1/me answers 401', async () => {
    const { calls } = signedIn({
      more: { 'GET /v1/me': [refusal(401, 'unauthorized'), answer(profile)] }
    })
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    expect(callTo(calls, 'GET /v1/me').map(call => call.authorization)).toEqual([
      'Bearer old-access',
      'Bearer new-access'
    ])
  })

  test('says it could not reach the account service, and tries again when asked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, "We couldn't reach your Zenbu account")
    signedIn()
    await click(page, 'Try again')
    await shows(page, `Signed in as ${email}`)
  })

  test('shows the profile as it is now when a change conflicts with one made elsewhere', async () => {
    const current = { ...profile, name: 'From the app', version: 4 }
    const { calls } = signedIn({
      more: {
        'PATCH /v1/me': refusal(409, 'version_conflict', { current })
      }
    })
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    await fill(page, 'Name', 'Kana')
    await submit(page, 'Save')
    await shows(page, 'Your profile changed in another app')
    expect(callTo(calls, 'PATCH /v1/me')[0]?.body).toEqual({ baseVersion: 3, name: 'Kana' })
    expect(page.querySelector<HTMLInputElement>('#profile-name')?.value).toBe('From the app')
  })

  test('signs out of this browser', async () => {
    const { calls } = signedIn()
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    await click(page, 'Sign out')
    await shows(page, 'You’re signed out.')
    expect(callTo(calls, 'POST /v1/auth/sign-out')[0]?.credentials).toBe('include')
    expect(window.localStorage.getItem('zenbu-signed-in')).toBeNull()
  })

  test('deletes after the learner confirms and, with a sign-in over nine minutes old, signs in again by code', async () => {
    const { calls, routes } = signedIn({ signedInMinutesAgo: 20 })
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    await click(page, 'Delete account')
    await shows(page, `Delete ${email} and everything it synced?`)
    expect(routes()).not.toContain('DELETE /v1/me')
    await click(page, 'Delete my account')
    await confirmWithEmailCode(page)
    await shows(page, 'Your account is deleted.')
    expect(callTo(calls, 'POST /v1/auth/sign-in/email-otp')[0]?.body).toEqual({
      email,
      otp: '123456'
    })
    expect(callTo(calls, 'POST /v1/auth/revoke-session')[0]?.body).toEqual({ token: 'old-bare' })
    expect(callTo(calls, 'DELETE /v1/me')).toEqual([
      expect.objectContaining({ authorization: 'Bearer new-access', body: { confirm: true } })
    ])
    expect(window.localStorage.getItem('zenbu-signed-in')).toBeNull()
  })

  test('asks for a fresh sign-in when the service answers sign_in_again, though the page thought it fresh', async () => {
    const { calls } = signedIn({
      more: {
        'DELETE /v1/me': [refusal(403, 'sign_in_again'), answer({ status: 'deleted' })]
      }
    })
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    await click(page, 'Delete account')
    await click(page, 'Delete my account')
    await shows(page, 'For your security, confirm it’s you first.')
    await confirmWithEmailCode(page)
    await shows(page, 'Your account is deleted.')
    expect(callTo(calls, 'DELETE /v1/me')).toHaveLength(2)
  })

  test("deletes an Apple account with Apple's code, after Apple signs it in again with the same Apple ID", async () => {
    const init = appleAnswering('001.apple')
    const { calls, page } = await deletingAnAppleAccount()
    await shows(page, 'Apple confirms it’s you')
    expect(page.textContent).not.toContain('Email me a code')
    await click(page, 'Continue with Apple')
    await shows(page, 'Your account is deleted.')
    const returnUrl = `${window.location.origin}/account/`
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'com.zenbujapanese.web',
        redirectURI: returnUrl,
        usePopup: true
      })
    )
    expect(callTo(calls, 'POST /v1/auth/sign-in/social')[0]?.body).toEqual({
      provider: 'apple',
      idToken: { token: idTokenFor('001.apple'), nonce: 'n1' }
    })
    expect(callTo(calls, 'DELETE /v1/me')[0]?.body).toEqual({
      confirm: true,
      appleAuthorizationCode: 'apple-code-for-001.apple',
      appleRedirectUri: returnUrl
    })
  })

  test("won't confirm with another Apple ID, and asks again when Apple refuses the code", async () => {
    appleAnswering('002.someone-else')
    const { routes, page } = await deletingAnAppleAccount({
      'DELETE /v1/me': refusal(400, 'apple_authorization_invalid')
    })
    await click(page, 'Continue with Apple')
    await shows(page, 'That Apple ID is a different one')
    expect(routes()).not.toContain('POST /v1/auth/sign-in/social')

    appleAnswering('001.apple')
    await click(page, 'Continue with Apple')
    await shows(page, "Apple didn't accept that. Continue with Apple again.")
    expect(page.textContent).toContain('Continue with Apple')
    expect(page.textContent).not.toContain('Your account is deleted.')
  })

  test('removes a way to sign in after asking, and after a fresh sign-in when the last is old', async () => {
    const { calls } = signedIn({
      signedInMinutesAgo: 20,
      ways: [emailWay, googleWay],
      more: { 'POST /v1/auth/unlink-account': answer({ status: true }) }
    })
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    await click(page, 'Remove Google')
    await shows(page, 'Stop signing in with Google?')
    await click(page, 'Remove it')
    await confirmWithEmailCode(page)
    await settle()
    await vi.waitFor(() =>
      expect(callTo(calls, 'POST /v1/auth/unlink-account')[0]?.body).toEqual({ accountId: 'i3' })
    )
    await vi.waitFor(() => expect(callTo(calls, 'GET /v1/auth/list-accounts')).toHaveLength(2))
  })

  test('adds Google by sending the browser to Google, to come back to the account page', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, origin: window.location.origin, assign })
    const { calls } = signedIn({
      more: {
        'POST /v1/auth/link-social': answer({
          url: 'https://accounts.google.com/x',
          redirect: true
        })
      }
    })
    const page = render(<AccountView settings={settings(false, true)} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    await click(page, 'Add Google')
    const back = `${window.location.origin}/account/`
    expect(callTo(calls, 'POST /v1/auth/link-social')[0]?.body).toEqual({
      provider: 'google',
      callbackURL: back,
      errorCallbackURL: back
    })
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/x')
  })

  test("adds the account's own email as a way to sign in, with a code", async () => {
    const { calls } = signedIn({ ways: [googleWay] })
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    expect(page.textContent).not.toContain('Remove')
    await click(page, 'Add an email code')
    await shows(page, `We'll email a code to ${email}`)
    await submit(page, 'Email me a code')
    await fill(page, 'Code', '123456')
    await submit(page, 'Add it')
    expect(callTo(calls, 'POST /v1/auth/sign-in/email-otp')[0]).toMatchObject({
      credentials: 'include',
      body: { email, otp: '123456' }
    })
    await vi.waitFor(() => expect(callTo(calls, 'GET /v1/auth/list-accounts')).toHaveLength(2))
  })
})

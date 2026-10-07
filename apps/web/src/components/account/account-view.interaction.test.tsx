import { afterEach, describe, expect, test, vi } from 'vitest'
import { accessTokens } from '@/lib/account/access-tokens'
import { accountApi } from '@/lib/account/client'
import { idTokenFor } from '@/test/account-answers'
import {
  answer,
  apiUrl,
  click,
  fill,
  refusal,
  render,
  shows,
  stubAccountService,
  submit,
  unmount
} from '@/test/account-page'
import {
  appleAnswering,
  appleWay,
  callTo,
  confirmWithEmailCode,
  email,
  emailWay,
  googleWay,
  newAccess,
  oldAccess,
  profile,
  sessionAnswer,
  settings,
  signedIn
} from '@/test/signed-in-account'
import { AccountView } from './account-view'
import { ConfirmItsYou } from './confirm-its-you'

afterEach(unmount)

async function askedToDelete(appleOffered = false) {
  const page = render(<AccountView settings={settings(appleOffered)} returnedError={null} />)
  await shows(page, `Signed in as ${email}`)
  await click(page, 'Delete account')
  await click(page, 'Delete my account')
  return page
}

async function deletingAnAppleAccount(more: Parameters<typeof stubAccountService>[0] = {}) {
  const service = signedIn({
    ways: [appleWay],
    more: {
      'POST /v1/auth/sign-in/social': answer({ token: 'new-bare', user: { id: 'u1' } }),
      ...more
    }
  })
  return { ...service, page: await askedToDelete(true) }
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
      expect.objectContaining({ credentials: 'omit', authorization: `Bearer ${oldAccess}` })
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
      `Bearer ${oldAccess}`,
      `Bearer ${newAccess}`
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
      expect.objectContaining({ authorization: `Bearer ${newAccess}`, body: { confirm: true } })
    ])
    expect(window.localStorage.getItem('zenbu-signed-in')).toBeNull()
  })

  test('asks for a fresh sign-in when the service answers sign_in_again, though the page thought it fresh', async () => {
    const { calls } = signedIn({
      more: {
        'DELETE /v1/me': [refusal(403, 'sign_in_again'), answer({ status: 'deleted' })]
      }
    })
    const page = await askedToDelete()
    await shows(page, 'For your security, confirm it’s you first.')
    await confirmWithEmailCode(page)
    await shows(page, 'Your account is deleted.')
    expect(callTo(calls, 'DELETE /v1/me')).toHaveLength(2)
  })

  test("deletes an Apple account with Apple's code, after Apple signs it in again with the same Apple ID", async () => {
    const { init } = appleAnswering('001.apple')
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
    const apple = appleAnswering('002.someone-else')
    const { routes, page } = await deletingAnAppleAccount({
      'DELETE /v1/me': refusal(400, 'apple_authorization_invalid')
    })
    await click(page, 'Continue with Apple')
    await shows(page, 'That Apple ID is a different one')
    expect(routes()).not.toContain('POST /v1/auth/sign-in/social')
    expect(
      routes().filter(route => route === 'POST /v1/auth/sign-in/nonce'),
      'the next popup is ready before the next click'
    ).toHaveLength(2)

    apple.sub = '001.apple'
    await click(page, 'Continue with Apple')
    await shows(page, "Apple didn't accept that. Continue with Apple again.")
    expect(page.textContent).toContain('Continue with Apple')
    expect(page.textContent).not.toContain('Your account is deleted.')
  })

  test('keeps the learner signed in, and says so, when signing out fails', async () => {
    signedIn({ more: { 'POST /v1/auth/sign-out': refusal(500, 'internal') } })
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    await click(page, 'Sign out')
    await shows(page, 'Something went wrong on our side')
    expect(page.textContent).toContain(`Signed in as ${email}`)
  })

  test("after confirming with Google, signs the earlier session out, or says when Google's account is another's", async () => {
    window.sessionStorage.setItem(
      'zenbu-confirming',
      JSON.stringify({ userId: 'u1', token: 'older' })
    )
    const same = signedIn()
    let page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    await vi.waitFor(() =>
      expect(callTo(same.calls, 'POST /v1/auth/revoke-session')[0]?.body).toEqual({
        token: 'older'
      })
    )
    unmount()

    window.sessionStorage.setItem('zenbu-confirming', JSON.stringify({ userId: 'u9', token: 'x' }))
    const other = signedIn()
    page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, `That Google account signs in to another Zenbu account`)
    expect(callTo(other.calls, 'POST /v1/auth/revoke-session')).toEqual([])
    expect(window.sessionStorage.getItem('zenbu-confirming')).toBeNull()
  })

  test("counts no confirmation when Google's sign-in didn't happen, as back from a failed one", async () => {
    window.sessionStorage.setItem(
      'zenbu-confirming',
      JSON.stringify({ userId: 'u1', token: 'old-bare' })
    )
    const { routes } = signedIn({ signedInMinutesAgo: 20 })
    const page = await askedToDelete()
    await shows(page, 'Confirm it’s you')
    expect(routes()).not.toContain('POST /v1/auth/revoke-session')
    expect(routes()).not.toContain('DELETE /v1/me')
  })

  test('goes on with nothing when confirming lands the browser in another account', async () => {
    signedIn({
      more: {
        'GET /v1/auth/get-session': sessionAnswer('u9', 'their-bare', 0, 'someone@example.com')
      }
    })
    const api = accountApi(apiUrl)
    const onConfirmed = vi.fn()
    const page = render(
      <ConfirmItsYou
        api={api}
        tokens={accessTokens(api)}
        settings={settings()}
        account={{
          session: { userId: 'u1', email, signedInAt: 0, token: 'old-bare' },
          profile,
          identities: [{ id: 'i1', provider: 'email', subject: email }]
        }}
        appleOnly={false}
        why="Deleting needs a sign-in from the last few minutes."
        onConfirmed={onConfirmed}
        onCancel={() => undefined}
      />
    )
    await confirmWithEmailCode(page)
    await vi.waitFor(() =>
      expect(onConfirmed).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u9' }),
        null,
        false
      )
    )
  })

  test('deletes nothing when the learner cancels while confirming is still finishing', async () => {
    let finish: (response: Response) => void = () => {}
    const { routes } = signedIn({
      signedInMinutesAgo: 20,
      more: {
        'GET /v1/auth/get-session': [
          sessionAnswer('u1', 'old-bare', 20),
          () => new Promise<Response>(resolve => (finish = resolve))
        ]
      }
    })
    const page = await askedToDelete()
    await confirmWithEmailCode(page)
    await click(page, 'Cancel')
    finish(sessionAnswer('u1', 'new-bare', 0))
    await shows(page, 'Delete account')
    await vi.waitFor(() => expect(routes()).toContain('POST /v1/auth/revoke-session'))
    expect(routes()).not.toContain('DELETE /v1/me')
  })

  test('shows a newer profile the page reads, as after removing a way to sign in', async () => {
    const newer = { ...profile, name: 'From the app', version: 5 }
    signedIn({
      ways: [emailWay, googleWay],
      more: {
        'GET /v1/me': [answer(profile), answer(newer)],
        'POST /v1/auth/unlink-account': answer({ status: true })
      }
    })
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    expect(page.querySelector<HTMLInputElement>('#profile-name')?.value).toBe('Kana Fan')
    await click(page, 'Remove Google')
    await click(page, 'Remove it')
    await vi.waitFor(() =>
      expect(page.querySelector<HTMLInputElement>('#profile-name')?.value).toBe('From the app')
    )
  })
})

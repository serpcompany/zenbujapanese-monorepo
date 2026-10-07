import { act } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { idTokenFor } from '@/test/account-answers'
import {
  answer,
  click,
  fill,
  refusal,
  render,
  settle,
  shows,
  submit,
  unmount
} from '@/test/account-page'
import {
  appleAnswering,
  callTo,
  confirmWithEmailCode,
  email,
  emailWay,
  googleWay,
  sessionAnswer,
  settings,
  signedIn,
  someoneElse,
  thenSomeoneElse
} from '@/test/signed-in-account'
import { AccountView } from './account-view'

afterEach(unmount)

const googlePage = () => answer({ url: 'https://accounts.google.com/x', redirect: true })

function leavingForGoogle() {
  const assign = vi.fn()
  vi.stubGlobal('location', { ...window.location, origin: window.location.origin, assign })
  return assign
}

async function codeTypedToAddEmail() {
  const page = render(<AccountView settings={settings()} returnedError={null} />)
  await shows(page, `Signed in as ${email}`)
  await click(page, 'Add an email code')
  await submit(page, 'Email me a code')
  await fill(page, 'Code', '123456')
  return page
}

async function removingGoogle(page: HTMLElement) {
  await shows(page, `Signed in as ${email}`)
  await click(page, 'Remove Google')
  await shows(page, 'Stop signing in with Google?')
  await click(page, 'Remove it')
}

describe('the ways to sign in, on the account page', () => {
  test('removes a way to sign in after asking, and after a fresh sign-in when the last is old', async () => {
    const { calls } = signedIn({
      signedInMinutesAgo: 20,
      ways: [emailWay, googleWay],
      more: { 'POST /v1/auth/unlink-account': answer({ status: true }) }
    })
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await removingGoogle(page)
    await confirmWithEmailCode(page)
    await settle()
    await vi.waitFor(() =>
      expect(callTo(calls, 'POST /v1/auth/unlink-account')[0]?.body).toEqual({ accountId: 'i3' })
    )
    await vi.waitFor(() => expect(callTo(calls, 'GET /v1/auth/list-accounts')).toHaveLength(2))
  })

  test('adds Google by sending the browser to Google, to come back to the account page', async () => {
    const assign = leavingForGoogle()
    const { calls } = signedIn({ more: { 'POST /v1/auth/link-social': googlePage() } })
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
    expect(callTo(calls, 'POST /v1/auth/revoke-session')[0]?.body).toEqual({ token: 'old-bare' })
  })

  test('adds Apple with its popup, and stays signed in when Apple is refused on the way', async () => {
    appleAnswering('001.apple')
    const { calls } = signedIn({
      more: {
        'POST /v1/auth/link-social': [refusal(401, 'invalid_nonce'), answer({ status: true })]
      }
    })
    const page = render(<AccountView settings={settings(true)} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    await click(page, 'Add Apple')
    await shows(page, 'That took too long. Try again.')
    expect(page.textContent).toContain(`Signed in as ${email}`)
    expect(window.localStorage.getItem('zenbu-signed-in')).toBe('yes')
    await click(page, 'Add Apple')
    expect(callTo(calls, 'POST /v1/auth/link-social')[1]?.body).toEqual({
      provider: 'apple',
      idToken: { token: idTokenFor('001.apple'), nonce: 'n1' }
    })
    await vi.waitFor(() => expect(callTo(calls, 'GET /v1/auth/list-accounts')).toHaveLength(2))
  })

  test('gets Apple ready when the learner tabs to Add Apple, before the click', async () => {
    appleAnswering('001.apple')
    const { routes } = signedIn()
    const page = render(<AccountView settings={settings(true)} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    const addApple = [...page.querySelectorAll('button')].find(
      button => button.textContent === 'Add Apple'
    )
    addApple?.focus()
    await settle()
    expect(routes()).toContain('POST /v1/auth/sign-in/nonce')
  })

  test('adds Apple after confirming, whatever the browser clock says of the new sign-in', async () => {
    appleAnswering('001.apple')
    const { calls } = signedIn({
      signedInMinutesAgo: 20,
      later: { userId: 'u1', minutesAgo: 20 },
      more: { 'POST /v1/auth/link-social': answer({ status: true }) }
    })
    const page = render(<AccountView settings={settings(true)} returnedError={null} />)
    await shows(page, `Signed in as ${email}`)
    await click(page, 'Add Apple')
    await confirmWithEmailCode(page)
    await shows(page, 'Confirmed. Now choose Add Apple again.')
    await click(page, 'Add Apple')
    await vi.waitFor(() => expect(callTo(calls, 'POST /v1/auth/link-social')).toHaveLength(1))
  })

  test('confirming with Google remembers the account it leaves from, and forgets it back without signing in', async () => {
    const assign = leavingForGoogle()
    signedIn({
      signedInMinutesAgo: 20,
      ways: [emailWay, googleWay],
      more: { 'POST /v1/auth/sign-in/social': googlePage() }
    })
    const page = render(<AccountView settings={settings(false, true)} returnedError={null} />)
    await removingGoogle(page)
    await click(page, 'Continue with Google')
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/x')
    expect(JSON.parse(window.sessionStorage.getItem('zenbu-confirming') ?? 'null')).toEqual({
      userId: 'u1',
      token: 'old-bare'
    })
    const backWithoutSigningIn = Object.assign(new Event('pageshow'), { persisted: true })
    await act(async () => window.dispatchEvent(backWithoutSigningIn))
    expect(window.sessionStorage.getItem('zenbu-confirming')).toBeNull()
  })

  test('asks to confirm first when the sign-in grows old while the email code is on its way', async () => {
    const { routes } = signedIn({ signedInMinutesAgo: 8, ways: [googleWay] })
    const page = await codeTypedToAddEmail()
    const later = Date.now() + 3 * 60_000
    const clock = vi.spyOn(Date, 'now').mockReturnValue(later)
    await submit(page, 'Add it')
    clock.mockRestore()
    await shows(page, 'Confirm it’s you')
    expect(routes()).not.toContain('POST /v1/auth/sign-in/email-otp')
  })

  test('asks to confirm when the service finds the sign-in too old for the email code', async () => {
    signedIn({
      ways: [googleWay],
      more: { 'POST /v1/auth/sign-in/email-otp': refusal(403, 'account_not_linked') }
    })
    const page = await codeTypedToAddEmail()
    await submit(page, 'Add it')
    await shows(page, 'Confirm it’s you')
    expect(page.textContent).not.toContain('Sign in that way')
  })

  test("stays on the page when the learner cancels while Google's sign-in is starting", async () => {
    const assign = leavingForGoogle()
    let start: (response: Response) => void = () => {}
    signedIn({
      signedInMinutesAgo: 20,
      ways: [emailWay, googleWay],
      more: {
        'POST /v1/auth/sign-in/social': () => new Promise<Response>(resolve => (start = resolve))
      }
    })
    const page = render(<AccountView settings={settings(false, true)} returnedError={null} />)
    await removingGoogle(page)
    await click(page, 'Continue with Google')
    await click(page, 'Cancel')
    start(googlePage())
    await settle()
    expect(assign).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('zenbu-confirming')).toBeNull()
  })

  test('changes nothing, and shows the account now signed in, when another tab signed in elsewhere', async () => {
    const { routes } = signedIn({
      ways: [emailWay, googleWay],
      later: { userId: 'u9', minutesAgo: 0, email: someoneElse.email },
      more: { ...thenSomeoneElse, 'POST /v1/auth/unlink-account': answer({ status: true }) }
    })
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await removingGoogle(page)
    await shows(page, `Signed in as ${someoneElse.email}`)
    expect(page.querySelector<HTMLInputElement>('#profile-name')?.value).toBe('Someone')
    expect(page.querySelectorAll('#profile-name')).toHaveLength(1)
    expect(page.textContent).not.toContain('Stop signing in with Google?')
    expect(routes()).not.toContain('POST /v1/auth/unlink-account')
  })

  test("says so, and changes nothing, when it can't tell which account the browser is in", async () => {
    const { routes } = signedIn({
      ways: [emailWay, googleWay],
      more: {
        'GET /v1/auth/get-session': [sessionAnswer('u1', 'old-bare', 1), refusal(500, 'internal')]
      }
    })
    const page = render(<AccountView settings={settings()} returnedError={null} />)
    await removingGoogle(page)
    await shows(page, 'Something went wrong on our side')
    expect(page.textContent).toContain(`Signed in as ${email}`)
    expect(routes()).not.toContain('POST /v1/auth/unlink-account')
  })
})

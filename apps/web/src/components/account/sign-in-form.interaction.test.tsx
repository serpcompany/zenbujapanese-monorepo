import { act, type ComponentProps } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AccountSettings } from '@/lib/account/settings'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
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
import { SignInForm } from './sign-in-form'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

afterEach(() => {
  unmount()
  push.mockReset()
  window.localStorage.clear()
})

const email = 'kana@example.com'
const everything: AccountSettings = {
  apiUrl,
  appleServicesId: 'com.zenbujapanese.website',
  google: true
}
const emailOnly: AccountSettings = { apiUrl, appleServicesId: null, google: false }

const signInForm = (
  shown: AccountSettings,
  purpose: ComponentProps<typeof SignInForm>['purpose'],
  { returnedError = null, locale = 'en' }: { returnedError?: string | null; locale?: Locale } = {}
) =>
  render(
    <SignInForm
      locale={locale}
      text={getDictionary(locale).account}
      settings={shown}
      purpose={purpose}
      returnedError={returnedError}
    />
  )

function leavingForGoogle() {
  const assign = vi.fn()
  vi.stubGlobal('location', { ...window.location, origin: window.location.origin, assign })
  const { calls } = stubAccountService({
    'POST /v1/auth/sign-in/social': answer({ url: 'https://accounts.google.com/x', redirect: true })
  })
  return { assign, calls }
}

describe('signing in on the website', () => {
  test('emails a code, signs in with it, and goes to the account page', async () => {
    window.localStorage.setItem('zenbu-initials', 'XY')
    const { calls } = stubAccountService({
      'POST /v1/auth/email-otp/send-verification-otp': answer({ success: true }),
      'POST /v1/auth/sign-in/email-otp': answer({ token: 'bare', user: { id: 'u1' } })
    })
    const page = signInForm(emailOnly, 'register')
    expect(page.textContent).not.toContain('with Apple')
    expect(page.textContent).not.toContain('with Google')
    await fill(page, 'Email', email)
    await submit(page, 'Email me a code')
    await shows(page, `We sent a 6-digit code to ${email}`)
    await fill(page, 'Code', '123456')
    await submit(page, 'Create account')
    expect(push).toHaveBeenCalledWith('/account/')
    expect(window.localStorage.getItem('zenbu-signed-in')).toBe('yes')
    expect(window.localStorage.getItem('zenbu-initials')).toBeNull()
    expect(calls.map(call => call.credentials)).toEqual(['include', 'include'])
  })

  test('tells a browser that already signed in where its account is', async () => {
    window.localStorage.setItem('zenbu-signed-in', 'yes')
    const page = signInForm(emailOnly, 'sign-in')
    await shows(page, 'You’re signed in. Go to your account.')
    expect(page.querySelector('a[href="/account/"]')?.textContent).toBe('Go to your account')
  })

  test('sends an Apple or Google account to sign in that way, here only where the site offers it', async () => {
    for (const [settings, says] of [
      [everything, 'Sign in that way, then add your email on your account page.'],
      [emailOnly, 'which this site doesn’t offer yet, so you can’t sign in to it here for now.'],
      [
        { ...emailOnly, appleServicesId: 'com.zenbujapanese.website' },
        'This site doesn’t offer Google yet.'
      ]
    ] as const) {
      stubAccountService({
        'POST /v1/auth/email-otp/send-verification-otp': answer({ success: true }),
        'POST /v1/auth/sign-in/email-otp': refusal(403, 'account_not_linked')
      })
      const page = signInForm(settings, 'email-only')
      await fill(page, 'Email', email)
      await submit(page, 'Email me a code')
      await fill(page, 'Code', '123456')
      await submit(page, 'Sign in')
      await shows(page, says)
      unmount()
    }
    expect(push).not.toHaveBeenCalled()
  })

  test('says why a code was refused, and how long to wait after too many', async () => {
    stubAccountService({
      'POST /v1/auth/email-otp/send-verification-otp': [
        answer({ success: true }),
        refusal(429, 'too_many_requests')
      ],
      'POST /v1/auth/sign-in/email-otp': refusal(400, 'invalid_otp')
    })
    const page = signInForm(emailOnly, 'sign-in')
    await fill(page, 'Email', email)
    await submit(page, 'Email me a code')
    await fill(page, 'Code', '000000')
    await submit(page, 'Sign in')
    await shows(page, 'That code isn’t right')
    await click(page, 'Send a new code')
    await shows(page, 'Too many tries. Wait a few minutes, then try again.')
    expect(push).not.toHaveBeenCalled()
  })

  test("signs in with Apple's popup, passing the first sign-in's name", async () => {
    const init = vi.fn()
    vi.stubGlobal('AppleID', {
      auth: {
        init,
        signIn: async () => ({
          authorization: {
            code: 'unused-here',
            id_token: idTokenFor('001.apple'),
            state: init.mock.lastCall?.[0]?.state
          },
          user: { name: { firstName: 'Kana', lastName: 'Fan' } }
        })
      }
    })
    const { calls } = stubAccountService({
      'POST /v1/auth/sign-in/nonce': answer({ nonce: 'n1', expiresIn: 600 }),
      'POST /v1/auth/sign-in/social': answer({ token: 'bare', user: { id: 'u1' } })
    })
    const page = signInForm(everything, 'sign-in')
    await click(page, 'Sign in with Apple')
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/account/'))
    expect(calls.at(-1)?.body).toEqual({
      provider: 'apple',
      idToken: {
        token: idTokenFor('001.apple'),
        nonce: 'n1',
        user: { name: { firstName: 'Kana', lastName: 'Fan' } }
      }
    })
  })

  test('sends the browser to Google, to come back to the account page, or here on a failure', async () => {
    const { assign, calls } = leavingForGoogle()
    const page = signInForm(everything, 'register')
    await click(page, 'Sign up with Google')
    expect(calls[0]?.body).toEqual({
      provider: 'google',
      callbackURL: `${window.location.origin}/account/`,
      errorCallbackURL: `${window.location.origin}/register/`
    })
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/x')
    const google = () => page.querySelector<HTMLButtonElement>('button[type="button"]')
    expect(google()?.disabled).toBe(true)
    const backAgain = Object.assign(new Event('pageshow'), { persisted: true })
    await act(async () => window.dispatchEvent(backAgain))
    expect(google()?.disabled).toBe(false)
  })

  test('speaks Japanese on a Japanese page, and comes back to the Japanese pages from Google', async () => {
    window.localStorage.setItem('zenbu-signed-in', 'yes')
    const { calls } = leavingForGoogle()
    const page = signInForm(everything, 'register', {
      returnedError: 'access_denied',
      locale: 'ja'
    })
    await shows(page, 'Googleでのログインはキャンセルされました。')
    expect(page.querySelector('a[href="/ja/account/"]')?.textContent).toBe('アカウントページへ')
    expect(page.textContent).toContain('Appleで登録')
    await click(page, 'Googleで登録')
    expect(calls[0]?.body).toEqual({
      provider: 'google',
      callbackURL: `${window.location.origin}/ja/account/`,
      errorCallbackURL: `${window.location.origin}/ja/register/`
    })
  })

  test("says what went wrong when Google's sign-in comes back with an error", async () => {
    stubAccountService({})
    const page = signInForm(everything, 'sign-in', { returnedError: 'account_not_linked' })
    await shows(page, 'An account already uses that email')
  })
})

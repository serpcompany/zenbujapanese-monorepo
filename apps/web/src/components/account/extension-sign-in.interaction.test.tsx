import { afterEach, describe, expect, test, vi } from 'vitest'
import { extensionId } from '@/lib/account/extension'
import { getDictionary } from '@/lib/i18n/dictionary'
import {
  answer,
  click,
  fill,
  refusal,
  render,
  shows,
  stubAccountService,
  submit,
  unmount
} from '@/test/account-page'
import { email, sessionAnswer, settings } from '@/test/signed-in-account'
import { ExtensionSignIn } from './extension-sign-in'

afterEach(unmount)

const text = getDictionary('en').account

const code = 'website-code-never-shown'

const codeAnswer = answer({ code, expiresIn: 300 })

const renderPage = () =>
  render(<ExtensionSignIn locale="en" text={text} settings={settings()} returnedError={null} />)

function extensionAnswering(reply: unknown) {
  const sendMessage = vi.fn(
    (_extension: string, _message: unknown, respond: (reply: unknown) => void) => respond(reply)
  )
  vi.stubGlobal('chrome', { runtime: { sendMessage } })
  return sendMessage
}

const signedInWithACode = () =>
  stubAccountService({
    'GET /v1/auth/get-session': sessionAnswer('u1', 'bare', 1),
    'POST /v1/auth/extension-code': codeAnswer
  })

async function clickSignIn() {
  const page = renderPage()
  await shows(page, `Signed in as ${email}`)
  await click(page, text.extension.signIn)
  return page
}

describe('signing the extension in from the website', () => {
  test('signed in, shows the account and hands the extension a code in one click', async () => {
    const { calls } = signedInWithACode()
    const sendMessage = extensionAnswering({ signedIn: true })
    const page = await clickSignIn()
    await shows(page, text.extension.signedIn)
    expect(calls.map(call => [call.route, call.credentials])).toEqual([
      ['GET /v1/auth/get-session', 'include'],
      ['POST /v1/auth/extension-code', 'include']
    ])
    expect(sendMessage).toHaveBeenCalledWith(
      extensionId,
      { type: 'sign-in', code },
      expect.any(Function)
    )
    expect(document.documentElement.outerHTML).not.toContain(code)
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(code)
  })

  test.each([
    ['signed-in-already', text.extension.signedInAlready],
    ['wait', text.messages.tooManyTries.wait],
    ['try-again', text.extension.tryAgain]
  ])('says what the extension answered: %s', async (said, shown) => {
    signedInWithACode()
    extensionAnswering({ signedIn: false, refusal: said })
    await shows(await clickSignIn(), shown)
  })

  test('asks for no code in a browser without the extension, and says where it works', async () => {
    const { routes } = signedInWithACode()
    await shows(await clickSignIn(), text.extension.noExtension)
    expect(routes()).not.toContain('POST /v1/auth/extension-code')
  })

  test('goes back to signing in when the session ended before the click', async () => {
    stubAccountService({
      'GET /v1/auth/get-session': [sessionAnswer('u1', 'bare', 1), answer(null)],
      'POST /v1/auth/extension-code': refusal(401, 'unauthorized')
    })
    const sendMessage = extensionAnswering({ signedIn: true })
    await shows(await clickSignIn(), text.extension.signInFirst)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  test('signed out, signs in here first, then offers the click', async () => {
    window.localStorage.setItem('zenbu-signed-in', 'yes')
    stubAccountService({
      'GET /v1/auth/get-session': [answer(null), sessionAnswer('u1', 'bare', 0)],
      'POST /v1/auth/email-otp/send-verification-otp': answer({ success: true }),
      'POST /v1/auth/sign-in/email-otp': answer({ token: 'bare', user: { id: 'u1' } })
    })
    const page = renderPage()
    await shows(page, text.extension.signInFirst)
    expect(window.localStorage.getItem('zenbu-signed-in')).toBeNull()
    await fill(page, 'Email', email)
    await submit(page, 'Email me a code')
    await fill(page, 'Code', '123456')
    await submit(page, 'Sign in')
    await shows(page, `Signed in as ${email}`)
    expect(page.textContent).toContain(text.extension.signIn)
    expect(window.localStorage.getItem('zenbu-signed-in')).toBe('yes')
  })

  test('offers Try again when the service cannot be reached', async () => {
    stubAccountService({
      'GET /v1/auth/get-session': [
        new Response('down', { status: 503 }),
        sessionAnswer('u1', 'bare', 1)
      ]
    })
    const page = renderPage()
    await shows(page, text.view.tryAgain)
    await click(page, text.view.tryAgain)
    await shows(page, `Signed in as ${email}`)
  })
})

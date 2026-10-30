import { signInCodeCases as codes, textOf } from '@zenbu/account-rules/test/cases'
import { afterEach, describe, expect, it } from 'vitest'
import { json, signedInAnswer, startAccountOn, subscription, user } from '../test/account-stand-in'
import { startExtension } from '../test/extension'
import { byText, click, find, type Rendered, render, settle, typeInto } from '../test/render'
import { AccountView } from './account-view'
import { accountLabels } from './labels'

let shown: Rendered | undefined

afterEach(() => {
  shown?.unmount()
  shown = undefined
  document.body.replaceChildren()
})

async function codeSent(typed: string) {
  const service = startAccountOn(startExtension(), {
    'POST /v1/auth/email-otp/send-verification-otp': () => json(200, { success: true }),
    'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-1'),
    'GET /v1/auth/token': () => json(200, { token: 'access-1' }),
    'GET /v1/me/subscription': () => json(200, subscription)
  })
  shown = render(<AccountView />)
  await settle()
  const view = shown.container
  typeInto(find(view, 'input[type="email"]'), user.email)
  await click(byText(view, 'button', accountLabels.sendCode))
  const field = find(view, 'input[autocomplete="one-time-code"]') as HTMLInputElement
  typeInto(field, typed)
  const valid = field.checkValidity()
  await click(byText(view, 'button', accountLabels.signIn))
  const signIn = service.asked.find(asked => asked.route === 'POST /v1/auth/sign-in/email-otp')
  shown.unmount()
  shown = undefined
  return { sent: (signIn?.body as { otp?: string } | undefined)?.otp, valid }
}

describe("the extension's sign-in code field", () => {
  it('takes six digits once trimmed, as the shared rule says, a space before them too', async () => {
    for (const { covers, typed, code } of codes.accepted) {
      expect(await codeSent(textOf(typed)), covers).toEqual({ sent: code, valid: true })
    }
  })

  it('sends nothing the shared rule refuses', async () => {
    for (const { covers, typed } of codes.refused) {
      expect((await codeSent(textOf(typed))).sent, covers).toBeUndefined()
    }
  })
})

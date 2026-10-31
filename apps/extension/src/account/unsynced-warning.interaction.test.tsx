import { afterEach, describe, expect, it } from 'vitest'
import { askCopy } from '../shared/account-copy'
import { json, signedInAnswer, startAccountOn, user } from '../test/account-stand-in'
import { subscribed, word } from '../test/copy-world'
import { startExtension } from '../test/extension'
import { byText, click, find, type Rendered, render, settle, typeInto } from '../test/render'
import { AccountView } from './account-view'
import { accountLabels } from './labels'

const other = { id: 'user-2', email: 'other@example.com' }

let shown: Rendered | undefined

afterEach(() => {
  shown?.unmount()
  shown = undefined
  document.body.replaceChildren()
})

async function signInByCode(view: ParentNode, email: string) {
  typeInto(find(view, 'input[type="email"]'), email)
  await click(byText(view, 'button', accountLabels.sendCode))
  typeInto(find(view, 'input[autocomplete="one-time-code"]'), '123456')
  await click(byText(view, 'button', accountLabels.signIn))
}

const warning = (view: ParentNode) => view.querySelector('[data-account-unsynced]')?.textContent

describe('the warning before another account signs in', () => {
  it("says how many changes aren't synced to the account that made them, and goes once another account has signed in", async () => {
    startAccountOn(startExtension(), {
      'POST /v1/auth/email-otp/send-verification-otp': () => json(200, { success: true }),
      'POST /v1/auth/sign-in/email-otp': asked =>
        signedInAnswer(
          'session-1',
          (asked.body as { email: string }).email === other.email ? other : user
        ),
      'GET /v1/auth/token': () => json(200, { token: 'access-1' }),
      'GET /v1/me/subscription': () => json(200, subscribed),
      'POST /v1/sync': () => json(503, {}),
      'POST /v1/auth/sign-out': () => json(200, { success: true })
    })
    shown = render(<AccountView />)
    await settle()
    const view = shown.container
    expect(warning(view)).toBeUndefined()
    await signInByCode(view, user.email)
    await askCopy({ copy: 'change', change: { change: 'mark', ...word } })
    await click(byText(view, 'button', accountLabels.signOut))
    expect(warning(view)).toBe(accountLabels.unsynced(1, user.email))
    await signInByCode(view, other.email)
    await click(byText(view, 'button', accountLabels.signOut))
    expect(warning(view)).toBeUndefined()
  })

  it('counts more than one change in the plural', () => {
    expect(accountLabels.unsynced(3, user.email)).toContain('3 changes')
    expect(accountLabels.unsynced(3, user.email)).toContain('removes them')
  })
})

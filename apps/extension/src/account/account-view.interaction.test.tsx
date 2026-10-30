import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accountPage } from '../shared/account'
import {
  json,
  jwtWith,
  refusal,
  returnedFrom,
  signedInAnswer,
  startAccountOn,
  subscription,
  user
} from '../test/account-stand-in'
import { startExtension } from '../test/extension'
import { byText, click, find, type Rendered, render, settle, typeInto } from '../test/render'
import { AccountView } from './account-view'
import { accountLabels } from './labels'

const ids = vi.hoisted(() => ({
  google: 'zenbu-extension-test.apps.googleusercontent.com' as string | null
}))

vi.mock('../shared/hosts', async original => ({
  ...(await original<typeof import('../shared/hosts')>()),
  get googleClientId() {
    return ids.google
  }
}))

const words = accountLabels.deletion

const code = '123456'

const appStore = {
  ...subscription,
  status: 'active',
  active: true,
  managedIn: 'app_store',
  running: [
    { managedIn: 'app_store', status: 'active', expiresAt: '2026-11-30T00:00:00Z', willRenew: true }
  ],
  canSubscribe: false,
  cloudAccess: 'subscribed'
}

const website = {
  ...appStore,
  managedIn: 'website',
  running: [
    { managedIn: 'website', status: 'active', expiresAt: '2026-11-30T00:00:00Z', willRenew: true }
  ]
}

type Routes = Parameters<typeof startAccountOn>[1]

const signInRoutes = (more: Routes = {}): Routes => ({
  'POST /v1/auth/email-otp/send-verification-otp': () => json(200, { success: true }),
  'POST /v1/auth/sign-in/email-otp': () => signedInAnswer('session-1'),
  'POST /v1/auth/sign-in/nonce': () => json(200, { nonce: 'nonce-1' }),
  'POST /v1/auth/sign-in/social': () => signedInAnswer('session-social'),
  'GET /v1/auth/token': () => json(200, { token: jwtWith(Date.now() / 1000 + 3600) }),
  'GET /v1/me/subscription': () => json(200, subscription),
  'POST /v1/auth/sign-out': () => json(200, { success: true }),
  ...more
})

let shown: Rendered | undefined

async function showAccount(routes: Routes, authorize?: Parameters<typeof startAccountOn>[2]) {
  const fake = startExtension()
  const service = startAccountOn(fake, routes, authorize)
  shown = render(<AccountView />)
  await settle()
  return { fake, service, view: shown.container }
}

async function signInByCode(scope: ParentNode, email = user.email) {
  typeInto(find(scope, 'input[type="email"]'), email)
  await click(byText(scope, 'button', accountLabels.sendCode))
  typeInto(find(scope, 'input[autocomplete="one-time-code"]'), code)
  await click(byText(scope, 'button', accountLabels.signIn))
}

const stateOf = (view: HTMLElement) => find(view, '[data-account]').getAttribute('data-account')

const problem = (scope: ParentNode) => scope.querySelector('[role="alert"]')?.textContent

const dialog = () => find(document, '[data-delete-step]')

const keepLinksHere = (event: Event) => {
  if (event.target instanceof HTMLElement && event.target.closest('a')) event.preventDefault()
}

beforeEach(() => document.addEventListener('click', keepLinksHere, true))

afterEach(() => {
  shown?.unmount()
  shown = undefined
  ids.google = 'zenbu-extension-test.apps.googleusercontent.com'
  document.removeEventListener('click', keepLinksHere, true)
  document.body.replaceChildren()
})

describe('The account, signed out', () => {
  it('says Not signed in and offers an emailed code, Google, and Apple', async () => {
    const { view } = await showAccount(signInRoutes())
    expect(stateOf(view)).toBe('signed-out')
    expect(view.textContent).toContain(accountLabels.signedOut.title)
    expect(find(view, 'input[type="email"]').getAttribute('autocomplete')).toBe('email')
    for (const way of [accountLabels.sendCode, accountLabels.google, accountLabels.apple]) {
      expect(byText(view, 'button', way)).toBeTruthy()
    }
  })

  it('offers no Google sign-in in a build without a Google client', async () => {
    ids.google = null
    const { view } = await showAccount(signInRoutes())
    expect(view.textContent).not.toContain(accountLabels.google)
    expect(byText(view, 'button', accountLabels.apple)).toBeTruthy()
  })

  it('signs in with an emailed code, then shows the email and the subscription, never the profile', async () => {
    const { view, service } = await showAccount(signInRoutes())
    typeInto(find(view, 'input[type="email"]'), ` ${user.email} `)
    await click(byText(view, 'button', accountLabels.sendCode))
    expect(find(view, 'output').textContent).toContain(user.email)
    typeInto(find(view, 'input[autocomplete="one-time-code"]'), code)
    await click(byText(view, 'button', accountLabels.signIn))
    expect(service.asked.map(({ route, body }) => [route, body]).slice(0, 2)).toEqual([
      ['POST /v1/auth/email-otp/send-verification-otp', { email: user.email, type: 'sign-in' }],
      ['POST /v1/auth/sign-in/email-otp', { email: user.email, otp: code }]
    ])
    expect(stateOf(view)).toBe('signed-in')
    expect(find(view, '[data-account-email]').textContent).toBe(user.email)
    expect(find(view, '[data-subscription-state]').textContent).toBe(
      accountLabels.subscription.none
    )
    expect(view.textContent).not.toContain('Learner')
  })

  it('says how long to wait when codes are asked for too often, and when a code is wrong', async () => {
    let sends = 0
    const { view } = await showAccount(
      signInRoutes({
        'POST /v1/auth/email-otp/send-verification-otp': () =>
          ++sends === 1
            ? refusal(429, 'rate_limited', { 'retry-after': '30' })
            : json(200, { success: true }),
        'POST /v1/auth/sign-in/email-otp': () => refusal(400, 'invalid_otp')
      })
    )
    typeInto(find(view, 'input[type="email"]'), user.email)
    await click(byText(view, 'button', accountLabels.sendCode))
    expect(problem(view)).toBe(accountLabels.waitFor(30))
    await signInByCode(view)
    expect(problem(view)).toBe(accountLabels.refusals['wrong-code'])
    expect(stateOf(view)).toBe('signed-out')
  })

  it('signs in with Google, and after signing out, with Apple', async () => {
    const { view, service } = await showAccount(signInRoutes(), url =>
      returnedFrom(url, { id_token: 'id-token', code: 'apple-code' })
    )
    await click(byText(view, 'button', accountLabels.google))
    expect(stateOf(view)).toBe('signed-in')
    await click(byText(view, 'button', accountLabels.signOut))
    expect(stateOf(view)).toBe('signed-out')
    expect(view.textContent).toContain(accountLabels.signedOut.title)
    await click(byText(view, 'button', accountLabels.apple))
    expect(stateOf(view)).toBe('signed-in')
    const providers = service.asked
      .filter(({ route }) => route === 'POST /v1/auth/sign-in/social')
      .map(({ body }) => (body as { provider: string }).provider)
    expect(providers).toEqual(['google', 'apple'])
    expect(service.routes()).toContain('POST /v1/auth/sign-out')
  })

  it('says so when the learner closes the Google window', async () => {
    const { view } = await showAccount(signInRoutes(), () =>
      Promise.reject(new Error('The user did not approve access.'))
    )
    await click(byText(view, 'button', accountLabels.google))
    expect(problem(view)).toBe(accountLabels.refusals.cancelled)
  })
})

describe('The account, signed in', () => {
  it('links Subscribe… and Manage Account to the account page, and reads the subscription again on coming back', async () => {
    let held: unknown = subscription
    const { view, service } = await showAccount(
      signInRoutes({ 'GET /v1/me/subscription': () => json(200, held) })
    )
    await signInByCode(view)
    const subscribe = byText(view, 'a', accountLabels.subscription.subscribe)
    const manage = byText(view, 'a', accountLabels.manageAccount)
    for (const link of [subscribe, manage]) {
      expect(link.getAttribute('href')).toBe(accountPage)
      expect(link.getAttribute('target')).toBe('_blank')
    }
    const reads = () => service.routes().filter(route => route === 'GET /v1/me/subscription')
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(reads()).toHaveLength(1)
    await click(subscribe)
    held = website
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(reads()).toHaveLength(2)
    expect(find(view, '[data-subscription-state]').textContent).toBe(
      accountLabels.subscription.renews('November 30, 2026')
    )
    const manageSubscription = byText(view, 'a', accountLabels.subscription.manage)
    expect(manageSubscription.getAttribute('href')).toBe(accountPage)
    await click(manageSubscription)
    held = subscription
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(reads()).toHaveLength(3)
    expect(find(view, '[data-subscription-state]').textContent).toBe(
      accountLabels.subscription.none
    )
  })

  it('says an App Store subscription is managed in the App Store, with no link to manage it here', async () => {
    const { view } = await showAccount(
      signInRoutes({ 'GET /v1/me/subscription': () => json(200, appStore) })
    )
    await signInByCode(view)
    expect(view.textContent).toContain(accountLabels.subscription.appStore)
    expect(find(view, '[data-subscription]').getAttribute('data-subscription')).toBe('none')
  })
})

describe('Deleting the account', () => {
  it('warns that an App Store subscription goes on, keeps the account on Keep, and deletes after a fresh sign-in', async () => {
    const { view, service } = await showAccount(
      signInRoutes({
        'GET /v1/me/subscription': () => json(200, appStore),
        'DELETE /v1/me': () => json(200, { deleted: true, appStoreSubscriptionContinues: true })
      })
    )
    await signInByCode(view)
    await click(byText(view, 'button', words.deleteAccount))
    expect(dialog().getAttribute('data-delete-step')).toBe('confirm')
    expect(find(dialog(), '[data-app-store-continues]').textContent).toBe(words.appStoreContinues)
    await click(byText(dialog(), 'button', words.keep))
    expect(document.querySelector('[data-delete-step]')).toBeNull()
    await click(byText(view, 'button', words.deleteAccount))
    await click(byText(dialog(), 'button', words.confirm))
    expect(dialog().getAttribute('data-delete-step')).toBe('sign-in')
    const email = find(dialog(), 'input[type="email"]') as HTMLInputElement
    expect([email.value, email.readOnly]).toEqual([user.email, true])
    await click(byText(dialog(), 'button', accountLabels.sendCode))
    typeInto(find(dialog(), 'input[autocomplete="one-time-code"]'), code)
    await click(byText(dialog(), 'button', accountLabels.signIn))
    expect(service.asked.find(({ route }) => route === 'DELETE /v1/me')?.body).toEqual({
      confirm: true
    })
    expect(stateOf(view)).toBe('signed-out')
    expect(find(view, '[data-account-deleted]').textContent).toBe(
      `${words.deleted} ${words.appStoreStillBills}`
    )
  })

  it('asks for Apple when the service needs Apple to delete the account', async () => {
    let deletes = 0
    const { view, service } = await showAccount(
      signInRoutes({
        'DELETE /v1/me': () =>
          ++deletes === 1
            ? refusal(403, 'apple_authorization_needed')
            : json(200, { deleted: true, appStoreSubscriptionContinues: false })
      }),
      url => returnedFrom(url, { id_token: 'id-token', code: 'apple-code' })
    )
    await signInByCode(view)
    await click(byText(view, 'button', words.deleteAccount))
    await click(byText(dialog(), 'button', words.confirm))
    await click(byText(dialog(), 'button', accountLabels.sendCode))
    typeInto(find(dialog(), 'input[autocomplete="one-time-code"]'), code)
    await click(byText(dialog(), 'button', accountLabels.signIn))
    expect(dialog().getAttribute('data-delete-step')).toBe('apple')
    await click(byText(dialog(), 'button', accountLabels.apple))
    const deleted = service.asked.filter(({ route }) => route === 'DELETE /v1/me')
    expect(deleted.map(({ body }) => body)).toEqual([
      { confirm: true },
      { confirm: true, appleAuthorizationCode: 'apple-code' }
    ])
    expect(find(view, '[data-account-deleted]').textContent).toBe(words.deleted)
  })

  it('deletes nothing when the fresh sign-in is to another account', async () => {
    let signIns = 0
    const { view, service } = await showAccount(
      signInRoutes({
        'POST /v1/auth/sign-in/email-otp': () =>
          ++signIns === 1
            ? signedInAnswer('session-1')
            : signedInAnswer('session-other', { id: 'user-2', email: user.email })
      })
    )
    await signInByCode(view)
    await click(byText(view, 'button', words.deleteAccount))
    await click(byText(dialog(), 'button', words.confirm))
    await click(byText(dialog(), 'button', accountLabels.sendCode))
    typeInto(find(dialog(), 'input[autocomplete="one-time-code"]'), code)
    await click(byText(dialog(), 'button', accountLabels.signIn))
    expect(problem(dialog())).toBe(accountLabels.refusals['other-account'])
    expect(service.routes()).not.toContain('DELETE /v1/me')
    expect(stateOf(view)).toBe('signed-in')
  })
})

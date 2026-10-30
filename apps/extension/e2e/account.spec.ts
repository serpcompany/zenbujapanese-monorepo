import type { CDPSession, Page, Response } from '@playwright/test'
import { accountLabels } from '../src/account/labels.ts'
import {
  appleAuthorizeUrl,
  appleReturnPath,
  googleAuthorizeUrl
} from '../src/service-worker/account/identity.ts'
import {
  keptSessionToken,
  newEmail,
  openAccountPage,
  openAccountTab,
  signedInAs,
  signedOutTitle,
  signInByCode,
  signInWithGoogle,
  startSignedOut
} from './account-pages.ts'
import { testPage } from './expected.ts'
import { type Extension, expect, test } from './fixtures.ts'

test.use({ accountService: true })

const accountPage = 'https://zenbujapanese.com/account/'

const subscriptionRequired = {
  status: 'none',
  active: false,
  managedIn: null,
  expiresAt: null,
  willRenew: null,
  running: [],
  canSubscribe: true,
  cloudAccess: 'subscription_required'
}

const account = (extension: Extension) => {
  if (extension.account === null) throw new Error('These tests run with the account service.')
  return extension.account
}

const answered = (extension: Extension, path: string) =>
  extension.context.waitForEvent('response', {
    predicate: (response: Response) => new URL(response.url()).pathname === path
  })

const subscriptionAt = (extension: Extension) => `${account(extension).origin}/v1/me/subscription`

async function stubSubscription(extension: Extension) {
  await extension.context.route(subscriptionAt(extension), route =>
    route.fulfill({ json: subscriptionRequired })
  )
}

async function openSubscribe(page: Page, extension: Extension, outsideRequests: string[]) {
  await extension.context.route(accountPage, route => route.fulfill({ body: 'account page' }))
  const opened = extension.context.waitForEvent('page')
  await page.getByRole('button', { name: accountLabels.subscription.subscribe }).click()
  const tab = await opened
  await expect.poll(() => tab.url()).toBe(accountPage)
  await tab.close()
  expect(outsideRequests).toEqual([accountPage])
  outsideRequests.length = 0
  await page.bringToFront()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

test.beforeEach(async ({ extension, page }) => {
  await startSignedOut(page, extension)
})

test.afterEach(async ({ extension }) => {
  await extension.context.unroute(subscriptionAt(extension))
  await extension.context.unroute(accountPage)
})

test('the learner signs in with an emailed code on Settings’ Account page, and the Account tab shows the same account', async ({
  extension,
  page
}) => {
  const email = newEmail('code')
  const accountPageView = await openAccountPage(page, extension)
  await expect(accountPageView.getByText(signedOutTitle)).toBeVisible()
  await signInByCode(accountPageView, account(extension), email)
  await expect(signedInAs(accountPageView)).toHaveText(email)
  const sessionToken = await keptSessionToken(extension)
  const issued = await account(extension).call('/v1/auth/token', sessionToken)
  const claims = JSON.parse(
    Buffer.from(String(issued.body.token).split('.')[1] ?? '', 'base64url').toString()
  )
  expect([issued.status, claims.azp]).toEqual([200, 'zenbu-extension'])
  const panel = await extension.context.newPage()
  const tab = await openAccountTab(panel, extension)
  await expect(signedInAs(tab)).toHaveText(email)
  await panel.close()
})

test('the learner signs in with Google and with Apple through the stand-ins, Apple’s through the service’s return route, and signing out answers 200 and shows Not signed in', async ({
  extension,
  page
}) => {
  const { learner } = account(extension).providers
  learner.google = newEmail('google')
  learner.apple = newEmail('apple')
  const tab = await openAccountTab(page, extension)
  await tab.getByRole('button', { name: accountLabels.google }).click()
  await expect(signedInAs(tab)).toHaveText(learner.google)
  const signedOut = answered(extension, '/v1/auth/sign-out')
  await tab.getByRole('button', { name: accountLabels.signOut }).click()
  expect((await signedOut).status()).toBe(200)
  await expect(tab.getByText(signedOutTitle)).toBeVisible()
  await tab.getByRole('button', { name: accountLabels.apple }).click()
  await expect(signedInAs(tab)).toHaveText(learner.apple)
  expect(account(extension).providers.asked).toEqual([
    `${googleAuthorizeUrl} -> https://${extension.id}.chromiumapp.org/google`,
    `${appleAuthorizeUrl} -> ${account(extension).origin}${appleReturnPath}`
  ])
})

test('deleting an email account leaves GET /v1/auth/token answering 401 for its sessions', async ({
  extension,
  page
}) => {
  const email = newEmail('delete')
  const sessions: string[] = []
  const keep = (response: Response) => {
    const sessionToken = response.headers()['set-auth-token']
    if (sessionToken) sessions.push(sessionToken)
  }
  extension.context.on('response', keep)
  const view = await openAccountPage(page, extension)
  await signInByCode(view, account(extension), email)
  await view.getByRole('button', { name: accountLabels.deletion.deleteAccount }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: accountLabels.deletion.confirm }).click()
  await expect(dialog.getByLabel(accountLabels.email)).toHaveValue(email)
  await signInByCode(dialog, account(extension), email)
  await expect(view.locator('[data-account-deleted]')).toHaveText(accountLabels.deletion.deleted)
  await expect(view.getByText(signedOutTitle)).toBeVisible()
  extension.context.off('response', keep)
  expect(sessions).toHaveLength(2)
  for (const sessionToken of sessions) {
    expect((await account(extension).call('/v1/auth/token', sessionToken)).status).toBe(401)
  }
})

test('a session the service refuses with 401 shows the learner signed out', async ({
  extension,
  page,
  outsideRequests
}) => {
  await stubSubscription(extension)
  const view = await openAccountPage(page, extension)
  await signInWithGoogle(view, account(extension), newEmail('ended'))
  await expect(signedInAs(view)).toBeVisible()
  const sessionToken = await keptSessionToken(extension)
  expect((await account(extension).call('/v1/auth/sign-out', sessionToken, 'POST')).status).toBe(
    200
  )
  await extension.serviceWorker.evaluate(() => chrome.storage.session.clear())
  await openSubscribe(page, extension, outsideRequests)
  await expect(view.getByText(signedOutTitle)).toBeVisible()
  expect(await keptSessionToken(extension)).toBe('')
})

test('with the subscription answering subscription_required, the Account page shows No subscription, and Subscribe… opens zenbujapanese.com/account/ in a new tab', async ({
  extension,
  page,
  outsideRequests
}) => {
  await stubSubscription(extension)
  const view = await openAccountPage(page, extension)
  await signInWithGoogle(view, account(extension), newEmail('subscribe'))
  await expect(view.locator('[data-subscription-state]')).toHaveText(
    accountLabels.subscription.none
  )
  await openSubscribe(page, extension, outsideRequests)
  await expect(view.locator('[data-subscription-state]')).toHaveText(
    accountLabels.subscription.none
  )
})

async function isolatedWorld(cdp: CDPSession, extension: Extension): Promise<number> {
  const worlds: { id: number; origin: string; auxData?: { type?: string } }[] = []
  cdp.on('Runtime.executionContextCreated', ({ context }) => worlds.push(context))
  await cdp.send('Runtime.enable')
  const ours = () =>
    worlds.find(world => world.origin === extension.origin && world.auxData?.type === 'isolated')
  await expect.poll(() => ours()?.id).toBeDefined()
  return ours()?.id ?? 0
}

const probe = `(async () => {
  const read = async area => {
    try {
      return JSON.stringify(await chrome.storage[area].get(null))
    } catch (error) {
      return 'refused: ' + error.message
    }
  }
  const stores = async ({ name }) => {
    const db = await new Promise((resolve, reject) => {
      const opening = indexedDB.open(name)
      opening.onsuccess = () => resolve(opening.result)
      opening.onerror = () => reject(opening.error)
    })
    const names = [...db.objectStoreNames]
    const rows = await Promise.all(names.map(store => new Promise(resolve => {
      const reading = db.transaction(store).objectStore(store).getAll()
      reading.onsuccess = () => resolve(reading.result)
    })))
    db.close()
    return JSON.stringify(rows)
  }
  const databases = await indexedDB.databases()
  return {
    local: await read('local'),
    session: await read('session'),
    indexedDB: (await Promise.all(databases.map(stores))).join('')
  }
})()`

test('a content script reading local and session storage and the page’s IndexedDB finds no token', async ({
  extension,
  page
}) => {
  const view = await openAccountPage(page, extension)
  await signInWithGoogle(view, account(extension), newEmail('probe'))
  await expect(signedInAs(view)).toBeVisible()
  const sessionToken = await keptSessionToken(extension)
  expect(sessionToken.length).toBeGreaterThan(0)
  const site = await extension.context.newPage()
  const cdp = await extension.context.newCDPSession(site)
  await site.goto(`${extension.server.url}${testPage}`)
  const contextId = await isolatedWorld(cdp, extension)
  const { result } = await cdp.send('Runtime.evaluate', {
    expression: probe,
    contextId,
    awaitPromise: true,
    returnByValue: true
  })
  const found = result.value as { local: string; session: string; indexedDB: string }
  expect(found.local).toMatch(/^refused: /)
  expect(found.session).toMatch(/^refused: /)
  expect(JSON.stringify(found).includes(sessionToken), 'the content script found the token').toBe(
    false
  )
  await site.close()
})

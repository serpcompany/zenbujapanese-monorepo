import type { Locator, Page } from '@playwright/test'
import { accountLabels } from '../src/account/labels.ts'
import { sessionTokenKey } from '../src/service-worker/account/store.ts'
import type { AccountService } from './account-service.ts'
import { type Extension, expect, extensionUrl } from './fixtures.ts'

export const signedOutTitle = accountLabels.signedOut.title

export async function openAccountPage(page: Page, extension: Extension): Promise<Locator> {
  await page.goto(extensionUrl(extension, 'pages/settings.html#account'))
  return page.locator('main')
}

export async function startSignedOut(page: Page, extension: Extension) {
  await page.goto(extensionUrl(extension, 'pages/settings.html#account'))
  await page.evaluate(() =>
    chrome.runtime.sendMessage({ target: 'service-worker', account: { account: 'sign-out' } })
  )
}

export async function openAccountTab(page: Page, extension: Extension): Promise<Locator> {
  await page.goto(extensionUrl(extension, 'pages/side-panel.html'))
  await page.getByRole('tab', { name: 'Account' }).click()
  return page.getByRole('tabpanel')
}

export async function signInByCode(scope: Locator, account: AccountService, email: string) {
  const sentBefore = await account.mailTo(email)
  const emailField = scope.getByLabel(accountLabels.email)
  if (await emailField.isEditable()) await emailField.fill(email)
  await scope.getByRole('button', { name: accountLabels.sendCode }).click()
  await scope.getByLabel(accountLabels.code).fill(await account.codeFor(email, sentBefore))
  await scope.getByRole('button', { name: accountLabels.signIn, exact: true }).click()
}

export const signedInAs = (scope: Locator) => scope.locator('[data-account-email]')

export async function signInWithGoogle(scope: Locator, account: AccountService, email: string) {
  account.providers.learner.google = email
  await scope.getByRole('button', { name: accountLabels.google }).click()
  await expect(signedInAs(scope)).toHaveText(email)
}

export const keptSessionToken = (extension: Extension) =>
  extension.serviceWorker.evaluate(
    async key => String((await chrome.storage.local.get(key))[key] ?? ''),
    sessionTokenKey
  )

let made = 0

export const newEmail = (name: string) => `${name}-${Date.now()}-${++made}@example.com`

import type { Page } from '@playwright/test'
import {
  keptSessionToken,
  newEmail,
  openAccountTab,
  signedInAs,
  signedOutTitle,
  startSignedOut
} from './account-pages.ts'
import { testPage } from './expected.ts'
import { type Extension, expect, test } from './fixtures.ts'

test.use({ accountService: true })

const account = (extension: Extension) => {
  if (extension.account === null) throw new Error('These tests run with the account service.')
  return extension.account
}

type Reached = { reply: unknown } | 'unreachable'

const handOver = (page: Page, extension: Extension, code: string) =>
  page.evaluate(
    ({ id, code }) =>
      new Promise<Reached>(resolve => {
        const runtime = (globalThis as { chrome?: typeof chrome }).chrome?.runtime
        if (typeof runtime?.sendMessage !== 'function') return resolve('unreachable')
        runtime.sendMessage(id, { type: 'sign-in', code }, reply =>
          resolve(runtime.lastError ? 'unreachable' : { reply })
        )
      }),
    { id: extension.id, code }
  )

async function accountShown(extension: Extension) {
  const panel = await extension.context.newPage()
  const tab = await openAccountTab(panel, extension)
  return { tab, close: () => panel.close() }
}

test.beforeEach(async ({ extension, page }) => {
  await startSignedOut(page, extension)
})

test('a page on the website signs the extension in with one message, and a second answers signed-in-already and keeps the account', async ({
  extension,
  page
}) => {
  const email = newEmail('website')
  const code = await account(extension).websiteCode(email)
  await page.goto(`${extension.server.url}${testPage}`)
  expect(await handOver(page, extension, code)).toEqual({ reply: { signedIn: true } })
  const shown = await accountShown(extension)
  await expect(signedInAs(shown.tab)).toHaveText(email)
  await shown.close()
  const session = await keptSessionToken(extension)

  const another = await account(extension).websiteCode(newEmail('another'))
  expect(await handOver(page, extension, another)).toEqual({
    reply: { signedIn: false, refusal: 'signed-in-already' }
  })
  expect(await keptSessionToken(extension)).toBe(session)
  const again = await accountShown(extension)
  await expect(signedInAs(again.tab)).toHaveText(email)
  await again.close()
})

test('a page on an origin the build doesn’t list can’t reach the extension, which stays signed out', async ({
  extension,
  page
}) => {
  const email = newEmail('elsewhere')
  const code = await account(extension).websiteCode(email)
  await page.goto(`${extension.server.languageDataUrl}${testPage}`)
  expect(await handOver(page, extension, code)).toBe('unreachable')
  expect(await keptSessionToken(extension)).toBe('')
  const shown = await accountShown(extension)
  await expect(shown.tab.getByText(signedOutTitle)).toBeVisible()
  await shown.close()

  await page.goto(`${extension.server.url}${testPage}`)
  expect(await handOver(page, extension, code)).toEqual({ reply: { signedIn: true } })
})

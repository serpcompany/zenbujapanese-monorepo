import type { Page } from '@playwright/test'
import {
  email,
  signedInService,
  signedOutService,
  standInForTheAccountService
} from './account-stand-in'
import { expect, test } from './test'

const code = 'website-code-never-shown'

async function standInForTheExtension(page: Page, reply: unknown) {
  await page.addInitScript(answered => {
    const sent: unknown[] = []
    Object.assign(window, {
      sentToTheExtension: sent,
      chrome: {
        runtime: {
          sendMessage: (extension: string, message: unknown, respond: (reply: unknown) => void) => {
            sent.push({ extension, message })
            setTimeout(() => respond(answered), 0)
          }
        }
      }
    })
  }, reply)
}

const sentToTheExtension = (page: Page) =>
  page.evaluate(() => (window as unknown as { sentToTheExtension: unknown[] }).sentToTheExtension)

test.describe('the Chrome extension page', () => {
  test('signed in, one click signs the extension in to the same account', async ({ page }) => {
    await standInForTheAccountService(page, {
      ...signedInService,
      'POST /v1/auth/extension-code': { code, expiresIn: 300 }
    })
    await standInForTheExtension(page, { signedIn: true })
    await page.goto('/account/extension/')
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible()
    await page.getByRole('button', { name: 'Sign in to the extension' }).click()
    await expect(page.getByText('Zenbu Japanese for Chrome is signed in.')).toBeVisible()
    expect(await sentToTheExtension(page)).toEqual([
      { extension: 'kaalpflpefadijdemimciikalgpgjmok', message: { type: 'sign-in', code } }
    ])
    expect(page.url()).not.toContain(code)
    expect(await page.content()).not.toContain(code)
  })

  test('without the extension, says where it works and asks for no code', async ({ page }) => {
    const asked: string[] = []
    page.on('request', request => asked.push(request.url()))
    await standInForTheAccountService(page, signedInService)
    await page.goto('/account/extension/')
    await page.getByRole('button', { name: 'Sign in to the extension' }).click()
    await expect(
      page.getByText('This works in Chrome, with Zenbu Japanese for Chrome')
    ).toBeVisible()
    expect(asked.filter(url => url.includes('/v1/auth/extension-code'))).toEqual([])
  })

  test('signed out, signs in here first', async ({ page }) => {
    await standInForTheAccountService(page, signedOutService)
    await page.goto('/account/extension/')
    await expect(page.getByText('Sign in here first.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in to the extension' })).toHaveCount(0)
  })
})

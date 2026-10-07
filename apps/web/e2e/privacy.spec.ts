import type { Page } from '@playwright/test'
import { expect, test } from './test'

async function sectionText(page: Page, heading: string) {
  const title = page
    .getByRole('main')
    .getByRole('heading', { level: 2, name: heading, exact: true })
  await expect(title).toBeVisible()
  return title.evaluate(element => {
    const parts: string[] = []
    let next = element.nextElementSibling
    while (next && next.tagName !== 'H2') {
      parts.push(next.textContent ?? '')
      next = next.nextElementSibling
    }
    return parts.join(' ')
  })
}

async function expectNamed(page: Page, heading: string, terms: string[]) {
  const text = (await sectionText(page, heading)).toLowerCase()
  const missing = terms.filter(term => !text.includes(term.toLowerCase()))
  expect(missing, `The "${heading}" section doesn't name these`).toEqual([])
}

test.describe('privacy policy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/legal/privacy/')
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible()
  })

  test('names what a Zenbu account keeps, and that signed out the apps send it nothing', async ({
    page
  }) => {
    await expectNamed(page, 'Your Zenbu account', [
      'Zenbu user ID',
      'email and whether it',
      'name and a username, both optional',
      'profile picture',
      'Apple, Google, or a code we email you',
      "don't keep Apple's or Google's own sign-in tokens",
      'session for each device or browser',
      'IP address and user agent',
      'known words',
      "lists' names, their order, and the words in them",
      'result of each sync request',
      'signed out, our apps send nothing to our account service'
    ])
  })

  test('names Tomodachi and the only things it can do with the account', async ({ page }) => {
    await expectNamed(page, 'Tomodachi', [
      'works without an account',
      'iCloud',
      'read your lists',
      'read your known words',
      'mark words Known, but never clear a Known mark',
      'word cards',
      'split them into words',
      'browser extensions'
    ])
  })

  test('names where account data is kept and who processes it', async ({ page }) => {
    await expectNamed(page, 'Where account data is kept', [
      'database on our API servers',
      'pass through Cloudflare',
      'backed up each night',
      'Apple',
      'Google',
      'Cloudflare',
      'hosts our API servers'
    ])
  })

  test('says how long account data is kept, how to get a copy, and how to delete it', async ({
    page
  }) => {
    await expectNamed(page, 'Retention and deletion', [
      'until you delete the account',
      '60 days after it was last used',
      '10 minutes',
      "each sync request's result for 30 days",
      "each night's backup for 30 days",
      'delete your account in any of our apps that lets you create one',
      'deleted within 30 days',
      'keeps working signed out',
      'copy of the data your account holds'
    ])
  })
})

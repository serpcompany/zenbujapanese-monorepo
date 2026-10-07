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
    return parts.join(' ').replace(/\s+/g, ' ')
  })
}

async function expectNamed(page: Page, heading: string, terms: string[]) {
  const text = (await sectionText(page, heading)).toLowerCase()
  const missing = terms.filter(term => !text.includes(term.toLowerCase()))
  expect(missing, `The "${heading}" section doesn't name these`).toEqual([])
}

const listItems = (page: Page, holding: string) =>
  page.getByRole('main').getByRole('list').filter({ hasText: holding }).getByRole('listitem')

test.describe('privacy policy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/legal/privacy/')
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible()
  })

  test('names what a Zenbu account keeps, and that signed out the apps send it nothing', async ({
    page
  }) => {
    await expectNamed(page, 'The short version', [
      'does not collect or track data',
      'no account or cloud sync yet',
      'if you create or sign in to a Zenbu account once the app offers one'
    ])
    await expect(listItems(page, 'How you sign in:')).toHaveText([
      /^Your account: a Zenbu user ID; your email and whether it's verified; a name and a username, both optional; the address of your profile picture/,
      /^How you sign in: for each way you sign in \(Apple, Google, or a code we email you\), the provider and your account ID with it\. We don't keep Apple's or Google's own sign-in tokens\./,
      /^Where you're signed in: a session for each device or browser you sign in on, with its IP address and user agent/,
      /^The study data you sync: your known words.*your lists' names, their order, and the words in them; a record of each item's latest change.*the result of each sync request/
    ])
    await expectNamed(page, 'Your Zenbu account', [
      "doesn't offer Zenbu accounts yet",
      'signed out, our apps send nothing to our account service',
      'encrypted copy of each code',
      "aren't synced: they stay on your device"
    ])
  })

  test('names Tomodachi and the only things it can do with the account', async ({ page }) => {
    await expectNamed(page, 'Tomodachi', [
      'works without an account',
      'study progress in your iCloud account',
      'covers what Tomodachi does with a Zenbu account',
      'none of it is added to your account'
    ])
    await expect(listItems(page, 'read your known words')).toHaveText([
      'read your lists;',
      'read your known words;',
      'mark words Known, but never clear a Known mark;',
      'fetch word cards from our dictionary service, and send it answers you type to split them into words.'
    ])
  })

  test('names where account data is kept and who processes it', async ({ page }) => {
    await expectNamed(page, 'Where account data is kept', [
      'database on our API servers',
      'pass through Cloudflare',
      'backed up each night to private Cloudflare R2 storage',
      'each backup is deleted after 30 days',
      'If you sign in with Apple or Google, that company signs you in under its own terms'
    ])
    await expect(listItems(page, 'hosts our API servers')).toHaveText([
      /^Cloudflare, which carries traffic to our servers, sends our email, and stores the backups/,
      /^the company that hosts our API servers/
    ])
  })

  test('says how long account data is kept, how to get a copy, and how to delete it', async ({
    page
  }) => {
    await expect(listItems(page, "each night's backup")).toHaveText([
      /^your account and the data you sync until you delete the account/,
      /^each session until you sign out of it or delete the account; a session stops working 60 days after it was last used, and is deleted within an hour of that/,
      /^sign-in codes and one-time sign-in values for 10 minutes, deleted within an hour of that, and request counts for a day after their last request/,
      /^each sync request's result for 30 days/,
      /^each night's backup for 30 days/
    ])
    await expectNamed(page, 'Retention and deletion', [
      'delete your account in any of our apps that lets you create one',
      'deleted within 30 days',
      'keeps working signed out'
    ])
    await expect(
      page
        .getByRole('main')
        .getByText('To get a copy of the data your account holds')
        .getByRole('link')
    ).toHaveAttribute('href', /^mailto:/)
  })
})

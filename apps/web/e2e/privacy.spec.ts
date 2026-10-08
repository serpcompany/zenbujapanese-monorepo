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

const sectionHeading = (page: Page, heading: string) =>
  page.getByRole('main').getByRole('heading', { level: 2, name: heading, exact: true })

const listAfter = (page: Page, heading: string) =>
  sectionHeading(page, heading)
    .locator('xpath=following-sibling::*[1][self::ul]')
    .getByRole('listitem')

const tableRows = (page: Page, column: string) =>
  page
    .getByRole('main')
    .getByRole('table')
    .filter({ has: page.getByRole('columnheader', { name: column, exact: true }) })
    .getByRole('row')
    .filter({ has: page.getByRole('cell') })

test.describe('privacy policy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/legal/privacy/')
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible()
  })

  test('opens with a short version in five points', async ({ page }) => {
    await expect(listAfter(page, 'The short version')).toHaveText([
      /works without an account/,
      /we keep your email, how you sign in, and the study data you sync/,
      /don't sell your information or use it for ads/,
      /companies help us run the service/,
      /see, export, correct, or delete your data, and delete your account/
    ])
  })

  test('says who we are and how to reach us', async ({ page }) => {
    await expectNamed(page, 'Who we are', ['provided by TSMC LLC', 'support@zenbujapanese.com'])
    await expect(
      sectionHeading(page, 'Who we are')
        .locator('xpath=following-sibling::*[1][self::p]')
        .getByRole('link', { name: 'support@zenbujapanese.com' })
    ).toHaveAttribute('href', 'mailto:support@zenbujapanese.com')
  })

  test('says what stays on the device, and that the app works without an account', async ({
    page
  }) => {
    await expectNamed(page, 'On your device', [
      'You never need an account',
      'private storage on your device',
      'sends us none of it unless you sign in to a Zenbu account',
      "uninstall the app, which doesn't delete a Zenbu account",
      'keeps no audio'
    ])
    await expectNamed(page, 'Your Zenbu account', [
      "While you're signed out, our apps send nothing to our account service",
      'where our apps or this website offer one',
      "notes, photos, searches, settings, and whole Translate conversations don't sync",
      'only the sentences you bookmark leave your device'
    ])
  })

  test('names each kind of data an account keeps, and why', async ({ page }) => {
    const rows = tableRows(page, 'Why')
    await expect(rows).toHaveText([
      /^Your account: your email.*To sign you in/,
      /^How you sign in: Apple, Google, or a code we email you.*To sign you in/,
      /^Your sessions: .*IP address.*keep the service secure/,
      /^Your study data: known words and lists.*Player.*Translate sentences you bookmark.*in step/,
      /^A record of each change you sync/
    ])
  })

  test('names who else handles the information', async ({ page }) => {
    await expect(listAfter(page, 'Who else handles your information')).toHaveText([
      /^Cloudflare hosts this website, delivers our downloads, carries requests to our servers, and stores our backups/,
      /^useSend sends our email, so it gets your email address/,
      /^The company that hosts our servers provides the machines our account database runs on/,
      /^Apple and Google sign you in, if you choose them/,
      /^YouTube receives your requests when you use Player/
    ])
    await expectNamed(page, 'Who else handles your information', [
      'may process information in the United States and other countries',
      'Cloudflare Web Analytics, which uses no cookies',
      'ask for consent where the law requires it'
    ])
  })

  test('says how long each kind of data is kept', async ({ page }) => {
    await expect(tableRows(page, 'How long')).toHaveText([
      /^Your account and study data.*Until you delete your account$/,
      /^Sessions.*60 days after you last use one$/,
      /^Sign-in codes.*10 minutes$/,
      /^Request counts.*A day after the last request$/,
      /^Records of each change you sync.*30 days/,
      /^Backups.*30 days$/,
      /^Support email.*As long as we need it/
    ])
  })

  test('gives the legal basis for each use', async ({ page }) => {
    await expect(listAfter(page, "Why we're allowed to use it")).toHaveText([
      /^Your account, the study data you sync, and our emails to you: they're needed to provide the account you asked for/,
      /^Sessions, request counts, backups, running this website and our downloads, and counting visits: our legitimate interest/,
      /^Support email: our legitimate interest/
    ])
  })

  test('names the rights to see, export, correct, and delete, and to complain', async ({
    page
  }) => {
    await expect(listAfter(page, 'Your rights')).toHaveText([
      /^See and export\. Email support@zenbujapanese\.com for a copy of the data your account holds/,
      /^Correct\. Change your name and username/,
      /^Delete\. Delete your account.*within 30 days/,
      /^Object or restrict\. Ask us to stop or limit/
    ])
    await expectNamed(page, 'Your rights', [
      "won't treat you differently for using these rights",
      'complain to your data protection authority'
    ])
  })

  test('covers children and changes, with the date of this version', async ({ page }) => {
    await expectNamed(page, 'Children', ['not directed to children under 13'])
    await expectNamed(page, 'Changes and contact', ['the date above marks the current version'])
    await expect(
      page.getByRole('main').getByText(/^Effective [A-Z][a-z]+ \d{1,2}, \d{4}$/)
    ).toBeVisible()
  })
})

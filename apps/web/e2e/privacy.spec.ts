import type { Page } from '@playwright/test'
import { company } from '../src/lib/company'
import { expect, sidewaysOverflow, test } from './test'

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
    .locator('xpath=following-sibling::*[self::ul or self::h2][1][self::ul]')
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
      /^We don't sell or share your personal information, and the app has no ads, analytics, or tracking\.$/,
      /companies help us run the service/,
      /see, export, correct, or delete your data, and delete your account/
    ])
  })

  test('says who we are and how to reach us', async ({ page }) => {
    await expectNamed(page, 'Who we are', [
      `provided by ${company.name}`,
      `${company.street}, ${company.city}, ${company.country}`,
      'support@zenbujapanese.com',
      company.phone
    ])
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
      /^Cloudflare hosts this website, delivers our downloads, carries requests to our servers, stores our backups, and forwards email sent to our support address/,
      /^useSend sends our email, so it gets your email address and the messages we send you, and keeps copies of them/,
      /^Lambda, Inc\. \(Lambda Labs\), in the United States, provides the machines our account database runs on/,
      /^Ahrefs counts visits to this website with Ahrefs Web Analytics, which uses no cookies/,
      /^Google serves Google Tag Manager, which loads Ahrefs Web Analytics on this website, hosts our support mailbox, and signs you in if you choose Google/,
      /^Apple signs you in if you choose Apple/,
      /^YouTube receives your requests when you use Player/
    ])
    await expectNamed(page, 'Who else handles your information', [
      "We don't sell or share your personal information",
      'may process information in the United States and other countries',
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
      "email us and we'll correct it",
      "won't treat you differently for using these rights",
      'complain to your data protection authority'
    ])
  })

  test('covers children and changes, with the date of this version', async ({ page }) => {
    await expectNamed(page, 'Children', [
      'not directed to children under 13',
      'If we learn that an account belongs to a child under 13, we delete it'
    ])
    await expectNamed(page, 'Changes and contact', ['the date above marks the current version'])
    await expect(
      page.getByRole('main').getByText(/^Effective [A-Z][a-z]+ \d{1,2}, \d{4}$/)
    ).toBeVisible()
  })
})

const tomodachiSection = '/legal/privacy/#tomodachi'

const description = (page: Page) => page.locator('meta[name="description"]')

async function expectTomodachiBelowTheHeader(page: Page) {
  const heading = sectionHeading(page, 'Tomodachi')
  await expect(heading).toBeInViewport()
  const gapBelowTheHeader = async () => {
    const [header, title] = await Promise.all([
      page.getByRole('banner').boundingBox(),
      heading.boundingBox()
    ])
    return header && title ? title.y - (header.y + header.height) : Number.NEGATIVE_INFINITY
  }
  await expect
    .poll(gapBelowTheHeader, { message: 'The pinned header covers the Tomodachi heading' })
    .toBeGreaterThanOrEqual(0)
}

test.describe('Tomodachi in the privacy policy and on the support page', () => {
  test('/legal/privacy/#tomodachi opens on what the policy says about Tomodachi', async ({
    page
  }) => {
    await page.goto(tomodachiSection)
    await expectTomodachiBelowTheHeader(page)
    await expectNamed(page, 'Tomodachi', [
      'works without an account or sign-in',
      'Tomo, its words, and your answers',
      'syncs it through your own iCloud, in your private CloudKit database',
      "We run no server for it and can't see that progress",
      'notifications it schedules on your device, not push notifications from us',
      'no ads, analytics, or tracking',
      "doesn't use the microphone or speech recognition",
      'The Mac app works the same way',
      'opens when you log in to your Mac only if you turn that on',
      'If you link your Zenbu account to it',
      "our dictionary service, which doesn't keep what it sends"
    ])
    expect(await sectionText(page, 'Your Zenbu account')).not.toContain('Tomodachi')
    await expect(description(page)).toHaveAttribute('content', /Tomodachi/)
  })

  test('the support page sends Tomodachi help to the support address, and links its section', async ({
    page
  }) => {
    await page.goto('/support/')
    await expect(description(page)).toHaveAttribute('content', /Tomodachi/)
    const main = page.getByRole('main')
    await expect(main.getByText(/^For help with Tomodachi, email the same address\./)).toBeVisible()
    await main.getByRole('link', { name: 'how Tomodachi handles your information' }).click()
    await expect(page).toHaveURL(/\/legal\/privacy\/#tomodachi$/)
    await expectTomodachiBelowTheHeader(page)
  })

  test.describe('on the narrowest phones', () => {
    test.skip(({ isMobile }) => !isMobile, 'Only a phone is this narrow')

    for (const width of [320, 390]) {
      for (const path of ['/legal/privacy/', '/support/']) {
        test(`${path} fits a ${width}px phone, in light and dark`, async ({ page }) => {
          await page.setViewportSize({ width, height: 800 })
          for (const colorScheme of ['light', 'dark'] as const) {
            await page.emulateMedia({ colorScheme })
            await page.goto(path)
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
            expect(
              await sidewaysOverflow(page),
              `The page scrolls sideways in ${colorScheme}`
            ).toBeLessThanOrEqual(0)
          }
        })
      }
    }
  })
})

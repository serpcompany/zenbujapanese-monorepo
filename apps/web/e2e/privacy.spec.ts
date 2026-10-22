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

const appLabelsInReports = (page: Page, heading: string) =>
  sectionHeading(page, heading).locator(
    'xpath=following-sibling::p[preceding-sibling::h2[1][@id="reports"]]//strong'
  )

const appLabels = ['Send Crash Reports', 'Report a Problem…', 'Included with your report']

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

  test('opens with a short version in six points', async ({ page }) => {
    await expect(listAfter(page, 'The short version')).toHaveText([
      /works without an account/,
      /crashes or freezes, it sends us a report without anything you read, type, say, or photograph, unless you turn crash reports off\. If you report a problem, we get what you write\.$/,
      /we keep your email, how you sign in, and the study data you sync/,
      /^We don't sell or share your personal information, and the app has no ads, usage analytics, or tracking\.$/,
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
      "the iPhone app syncs its profile's name, username, and photo",
      "a removed search keeps only a code that can't be turned back into it",
      "We keep your photos' files in Cloudflare R2",
      "The profile's email and whole Translate conversations don't sync",
      'only the sentences you bookmark leave your device',
      "Deleting your account deletes everything it synced, your photos' files included",
      'subscribe and manage a subscription you bought here'
    ])
  })

  test('names what the iPhone app syncs besides known words and lists', async ({ page }) => {
    await expect(tableRows(page, 'Why').filter({ hasText: /^Your study data/ })).toHaveText(
      /your notes, the photos in your Media Library with the words they're on, your settings, .*the frequency dictionaries you chose, and your 50 most recent searches/
    )
  })

  test('says what crash and problem reports send, what they never send, and how to turn crash reports off', async ({
    page
  }) => {
    await expectNamed(page, 'Crash and problem reports', [
      'crashes, freezes, or is closed by iOS',
      'sends a crash report to Sentry',
      "a code for the step and how it failed, never the error's own message",
      'Crash reports are on by default',
      "turn them off at any time with Send Crash Reports in the app's Account tab",
      "where in the app's code the problem happened, the app's version and build, the iOS version, your device's model",
      'a random identifier the app creates on your device',
      "A crash report doesn't link that identifier to your Zenbu account",
      'never includes what you read, type, say, or photograph',
      "your location, your device's name, or its language, region, and time zone",
      'removes the file paths, links, email addresses, and quoted text it finds in error messages, and the file names it recognizes, such as ones ending in .txt or .jpg',
      "Report a Problem… in the app's Account tab",
      "the email address in the form for a reply, if there is one, and the details the form lists under Included with your report: the app's version and build, the iOS version, your device's model, whether you're signed in, whether crash reports are on, which optional dictionaries you've installed, and whether the microphone and camera are allowed",
      "If you're signed in, the form fills in your Zenbu account's email, which you can change or clear; if you're signed out, it sends an email only if you add one",
      'alongside the other reports from the same copy of the app',
      "your account's email links those reports to your Zenbu account",
      'sent even when crash reports are off',
      'it can hold anything you type',
      'no screenshots, photos, searches, lists, or conversations',
      'not to store the address or the location it suggests'
    ])
    await expect(appLabelsInReports(page, 'Crash and problem reports')).toHaveText(appLabels)
    expect(await sectionText(page, 'Crash and problem reports')).not.toContain('Settings')
  })

  test('names each kind of data an account keeps, and why', async ({ page }) => {
    const rows = tableRows(page, 'Why')
    await expect(rows).toHaveText([
      /^Your account: your email.*To sign you in/,
      /^How you sign in: Apple, Google, or a code we email you.*To sign you in/,
      /^Your sessions: .*IP address.*keep the service secure/,
      /^Your study data: known words and lists.*Player.*Translate sentences you bookmark.*in step/,
      /^Your subscription, if you have one: where you bought it.*each payment, failed payment, refund, dispute, or card network's fraud warning.*Never your card details.*record of what you paid$/,
      /^A record of each change you sync/
    ])
  })

  test('names who else handles the information', async ({ page }) => {
    await expect(listAfter(page, 'Who else handles your information')).toHaveText([
      /^Cloudflare hosts this website, delivers our downloads, carries requests to our servers, stores our backups and your photos' files, and forwards email sent to our support address/,
      /^useSend sends our email, so it gets your email address and the messages we send you, and keeps copies of them/,
      /^Stripe takes the payments for subscriptions bought on this website\..*keeps its own record of them.*also after you delete your account; we never see your full card number\.$/,
      /^Lambda, Inc\. \(Lambda Labs\), in the United States, provides the machines our account database runs on/,
      /^Sentry \(Functional Software, Inc\.\), in the United States, collects and stores the app's crash reports and the problem reports you send/,
      /^Ahrefs counts visits to this website with Ahrefs Web Analytics, which uses no cookies/,
      /^Google serves Google Tag Manager, which loads Ahrefs Web Analytics on this website, hosts our support mailbox, and signs you in if you choose Google/,
      /^Apple signs you in if you choose Apple, and takes the payment for a subscription you buy in our apps on iPhone, iPad, or Mac\.$/,
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
      /^Your subscription and payment records.*7 years after the payment or the subscription's end, also after you delete your account, then deleted$/,
      /^That an account was deleted.*Its account ID and when it was deleted, with nothing else, for 7 years/,
      /^Sessions.*60 days after you last use one$/,
      /^Sign-in codes.*10 minutes$/,
      /^Request counts.*A day after the last request$/,
      /^Records of each change you sync.*30 days/,
      /^Your photos' files.*30 days after you remove it from its last word$/,
      /^Records of what you removed.*The latest 1,000 notes and 1,000 photos, the latest 500 words removed from each photo, and 100 videos and 100 searches; the rest until you delete your account$/,
      /^Backups.*30 days$/,
      /^Crash and problem reports.*Up to 90 days$/,
      /^Support email.*As long as we need it/
    ])
  })

  test('gives the legal basis for each use', async ({ page }) => {
    await expect(listAfter(page, "Why we're allowed to use it")).toHaveText([
      /^Your account, the study data you sync, and our emails to you: they're needed to provide the account you asked for/,
      /^Your subscription and payment records: they're needed to provide the subscription you bought, and to keep a record of payments\.$/,
      /^Sessions, request counts, backups, crash reports, running this website and our downloads, and counting visits: our legitimate interest/,
      /^Support email and problem reports: our legitimate interest in answering you and fixing what you report/
    ])
  })

  test('names the rights to see, export, correct, and delete, and to complain', async ({
    page
  }) => {
    await expect(listAfter(page, 'Your rights')).toHaveText([
      /^See and export\. Email support@zenbujapanese\.com for a copy of the data your account holds/,
      /^Correct\. Change your name and username/,
      /^Delete\. Delete your account.*within 30 days.*cancels a subscription you bought on this website; one bought in the App Store keeps billing until you cancel it there\. To delete a problem report you sent, email us\.$/,
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

async function expectBelowTheHeader(page: Page, name: string) {
  const heading = sectionHeading(page, name)
  await expect(heading).toBeInViewport()
  const gapBelowTheHeader = async () => {
    const [header, title] = await Promise.all([
      page.getByRole('banner').boundingBox(),
      heading.boundingBox()
    ])
    return header && title ? title.y - (header.y + header.height) : Number.NEGATIVE_INFINITY
  }
  await expect
    .poll(gapBelowTheHeader, { message: `The pinned header covers the ${name} heading` })
    .toBeGreaterThanOrEqual(0)
}

test('/legal/privacy/#reports opens on the crash and problem reports, below the header', async ({
  page
}) => {
  await page.goto('/legal/privacy/#reports')
  await expectBelowTheHeader(page, 'Crash and problem reports')
})

test('in Japanese, names the crash reports switch and Report a Problem… as the app shows them, in its Account tab', async ({
  page
}) => {
  const heading = 'クラッシュレポートと問題の報告'
  await page.goto('/ja/legal/privacy/')
  await expectNamed(page, heading, [
    'アプリのアカウントタブにある「Send Crash Reports」でいつでもオフにできます',
    'エラーメッセージに含まれるファイルのパス、リンク、メールアドレス、引用符で囲まれた文字列と、ファイル名として認識したもの（.txtや.jpgで終わる名前など）を削除します',
    'アプリのアカウントタブにある「Report a Problem…」から'
  ])
  await expect(appLabelsInReports(page, heading)).toHaveText(appLabels)
  expect(await sectionText(page, heading)).not.toContain('設定画面')
})

test.describe('Tomodachi in the privacy policy and on the support page', () => {
  test('/legal/privacy/#tomodachi opens on what the policy says about Tomodachi', async ({
    page
  }) => {
    await page.goto(tomodachiSection)
    await expectBelowTheHeader(page, 'Tomodachi')
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
    await expectBelowTheHeader(page, 'Tomodachi')
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

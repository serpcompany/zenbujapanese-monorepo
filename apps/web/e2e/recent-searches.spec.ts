import { createHmac } from 'node:crypto'
import type { Page } from '@playwright/test'
import { getDictionary } from '../src/lib/i18n/dictionary'
import { SyncedStandIn } from '../src/test/synced-stand-in'
import {
  seemSignedIn,
  signedInService,
  signedOutService,
  standInForTheAccountService
} from './account-stand-in'
import { expect, test } from './test'

const searchBox = getDictionary('en').searchForm.placeholder
const searched = '要る'

const idOf = (searchKey: string, query: string) =>
  createHmac('sha256', Buffer.from(searchKey, 'hex')).update(query.normalize('NFC')).digest('hex')

async function searchFor(page: Page, typed: string) {
  await page.goto('/dictionary/')
  await page.getByRole('textbox', { name: searchBox }).fill(typed)
  await page.getByRole('textbox', { name: searchBox }).press('Enter')
  await expect(page).toHaveURL(new RegExp(`/dictionary/search/${encodeURIComponent(searched)}/$`))
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

async function asASubscriber(page: Page, standIn = new SyncedStandIn()) {
  await seemSignedIn(page, 'KF')
  await standInForTheAccountService(page, signedInService, standIn)
  return standIn
}

const settled = (page: Page) => page.waitForLoadState('networkidle')

test.describe("a learner's searches on the website", () => {
  test("a subscriber's search goes into Recent searches, as the app's do", async ({ page }) => {
    const standIn = await asASubscriber(page)
    await searchFor(page, ` ${searched} `)
    await expect.poll(() => standIn.sent.length).toBe(1)
    expect(standIn.syncsAsked[0]).toEqual({ limit: 1 })
    expect(standIn.sent[0]).toMatchObject({
      entity: 'recentSearch',
      operation: 'search',
      entityId: idOf(standIn.searchKey, searched),
      baseVersion: 0,
      fields: { query: searched }
    })
    await page.goto('/account/recent-searches/')
    await expect(page.getByRole('main').getByRole('link', { name: searched })).toBeVisible()
  })

  test('a search page opened from a link, or reloaded, adds nothing', async ({ page }) => {
    const standIn = await asASubscriber(page)
    await page.goto(`/dictionary/search/${encodeURIComponent(searched)}/`)
    await settled(page)
    await page.reload()
    await settled(page)
    expect(standIn.syncsAsked).toEqual([])
  })

  test('signed out, a search sends nothing', async ({ page }) => {
    const standIn = new SyncedStandIn()
    await standInForTheAccountService(page, signedOutService, standIn)
    await searchFor(page, searched)
    await settled(page)
    expect(standIn.syncsAsked).toEqual([])
  })

  test.describe('without a subscription', () => {
    test.use({ allowedConsoleErrors: [/status of 402/] })

    test('a search is never sent', async ({ page }) => {
      const standIn = new SyncedStandIn()
      standIn.subscribed = false
      await asASubscriber(page, standIn)
      await searchFor(page, searched)
      await expect.poll(() => standIn.syncsAsked.length).toBe(1)
      await settled(page)
      expect(standIn.syncsAsked).toEqual([{ limit: 1 }])
      expect(standIn.sent).toEqual([])
    })
  })
})

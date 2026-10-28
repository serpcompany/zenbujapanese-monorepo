import type { Page } from '@playwright/test'
import { lookUpLabels } from '../src/look-up/labels.ts'
import { labels } from '../src/side-panel/labels.ts'
import { translateLabels } from '../src/translate/labels.ts'
import { type Extension, expect, extensionUrl, test } from './fixtures.ts'

const lastTabKey = 'sidePanel.lastTab'

async function openPanel(page: Page, extension: Extension, lastTab: string | null) {
  await page.goto(extensionUrl(extension, 'pages/side-panel.html'))
  await page.evaluate(
    ([key, kept]) =>
      kept === null ? chrome.storage.local.remove(key) : chrome.storage.local.set({ [key]: kept }),
    [lastTabKey, lastTab] as const
  )
  await page.reload()
}

const keptTab = (page: Page) =>
  page.evaluate(async key => (await chrome.storage.local.get(key))[key], lastTabKey)

test('the side panel shows the app’s four tabs, opens on Look Up, and each tab opens on its screen', async ({
  extension,
  page
}) => {
  await openPanel(page, extension, null)
  const tabBar = page.getByRole('tablist', { name: labels.tabBar })
  await expect(tabBar.getByRole('tab')).toHaveText(['Look Up', 'Translate', 'Player', 'Account'])
  await expect(page.getByRole('tab', { name: 'Look Up' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: lookUpLabels.box })).toBeVisible()

  await page.getByRole('tab', { name: 'Translate' }).click()
  await expect(page.getByRole('textbox', { name: translateLabels.box })).toBeVisible()
  await page.getByRole('button', { name: translateLabels.image }).click()
  await expect(page.getByText(labels.empty.imageSearch.title)).toBeVisible()
  await page.getByRole('button', { name: labels.backTo('Translate') }).click()
  await expect(page.getByRole('textbox', { name: translateLabels.box })).toBeVisible()

  await page.getByRole('tab', { name: 'Player' }).click()
  await expect(page.getByText(labels.empty.video.title)).toBeVisible()
  await expect(page.getByRole('heading', { name: labels.recent })).toBeVisible()
  await expect(page.getByText(labels.empty.recent.title)).toBeVisible()

  await page.getByRole('tab', { name: 'Account' }).click()
  await expect(page.getByText(labels.empty.account.title)).toBeVisible()
  await expect(page.getByText(labels.empty.words.title)).toBeVisible()
  await expect.poll(() => keptTab(page)).toBe('account')
})

for (const [kept, opens, saved] of [
  ['video', 'Player', 'player'],
  ['recent', 'Player', 'player'],
  ['images', 'Translate', 'translate'],
  ['words', 'Account', 'account']
]) {
  test(`a last tab kept as ${kept} opens the side panel on ${opens}`, async ({
    extension,
    page
  }) => {
    await openPanel(page, extension, kept)
    await expect(page.getByRole('tab', { name: opens })).toHaveAttribute('aria-selected', 'true')
    await expect.poll(() => keptTab(page)).toBe(saved)
  })
}

import { randomUUID } from 'node:crypto'
import type { Locator } from '@playwright/test'
import { fill } from '@zenbu/dictionary-core/detail/template'
import { savedWordsLabels as labels } from '../src/saved-words/labels.ts'
import { labels as panelLabels } from '../src/side-panel/labels.ts'
import { wordPopupLabels } from '../src/word-popup/labels.ts'
import { onTheAccount, word } from './account-copy.ts'
import {
  account,
  newEmail,
  openAccountPage,
  openAccountTab,
  signInWithGoogle,
  startSignedOut
} from './account-pages.ts'
import { expect, test } from './fixtures.ts'
import { caption, openAt } from './watch-page.ts'

test.use({ accountService: true, youTubeStandIn: true })

const youkyuu = {
  item: '01e90251c9810f2ef4c98b5e9d34de17',
  headword: '要求',
  reading: 'ようきゅう'
}

const row = (panel: Locator, title: string) =>
  panel.getByRole('button').filter({ has: panel.page().getByText(title, { exact: true }) })

const count = (panel: Locator, title: string) => row(panel, title).locator('[data-count]')

const savedWord = (panel: Locator, item: string) => panel.locator(`[data-saved-word="${item}"]`)

test.beforeEach(async ({ extension, page }) => {
  await startSignedOut(page, extension)
})

test('a word marked Known from a caption shows in Known Words at once, and Sync Now brings in a word the account already has', async ({
  extension,
  page
}) => {
  await signInWithGoogle(
    await openAccountPage(page, extension),
    account(extension),
    newEmail('words')
  )
  const panel = await openAccountTab(page, extension)
  await expect(count(panel, labels.knownWords)).toHaveText('0')

  const watch = await extension.context.newPage()
  await openAt(watch, 1)
  await caption(watch).locator(`[data-word="${word.headword}"]`).click()
  const popup = watch.getByRole('dialog', {
    name: fill(wordPopupLabels.word, { name: word.headword })
  })
  await popup
    .getByRole('button', {
      name: fill(wordPopupLabels.share.moreActions, { name: word.headword })
    })
    .click()
  await watch.getByRole('menuitemradio', { name: 'Known', exact: true }).click()

  await expect(count(panel, labels.knownWords)).toHaveText('1')
  await watch.close()
  await row(panel, labels.knownWords).click()
  const known = page.locator('[data-saved-page="known-words"]')
  await expect(savedWord(known, word.item)).toContainText(`${word.headword}【${word.reading}】`)
  await expect(savedWord(known, word.item).locator('[data-state-tag="known"]')).toBeVisible()
  await page.getByRole('button', { name: panelLabels.backTo('Account') }).click()

  await onTheAccount(account(extension), extension, [
    {
      id: randomUUID(),
      entity: 'knownWord',
      operation: 'mark',
      entityId: youkyuu.item,
      baseVersion: 0,
      fields: {
        headword: youkyuu.headword,
        reading: youkyuu.reading,
        stateChangedAt: new Date().toISOString()
      }
    }
  ])
  const tab = page.getByRole('tabpanel')
  await tab.locator('[data-sync]').getByRole('button', { name: labels.sync.syncNow }).click()
  await expect(count(tab, labels.knownWords)).toHaveText('2')
  await expect(tab.locator('[data-sync]')).toHaveAttribute('data-sync', 'synced')
  await expect(tab.locator('[data-last-synced]')).toHaveText('now')
  await expect(tab.locator('[data-waiting]')).toHaveCount(0)
  await row(tab, labels.knownWords).click()
  await expect(savedWord(known, youkyuu.item)).toContainText(
    `${youkyuu.headword}【${youkyuu.reading}】`
  )
  await expect(savedWord(known, word.item)).toBeVisible()
})

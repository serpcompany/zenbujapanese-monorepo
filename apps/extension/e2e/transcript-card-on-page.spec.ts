import { fill } from '@zenbu/dictionary-core/detail/template'
import { labels } from '../src/side-panel/labels.ts'
import { videoTabLabels } from '../src/video-tab/labels.ts'
import { wordPopupLabels } from '../src/word-popup/labels.ts'
import { type Extension, expect, extensionUrl, test } from './fixtures.ts'
import { openAt } from './watch-page.ts'
import { wordPopup } from './words-page.ts'

test.use({ youTubeStandIn: true })

const margin = 8

const watchTab = (extension: Extension) =>
  extension.serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://www.youtube.com/watch*' })
    return tab?.id ?? -1
  })

async function panelBeside(extension: Extension, tabId: number) {
  const panel = await extension.context.newPage()
  await panel.setViewportSize({ width: 380, height: 720 })
  await panel.addInitScript(id => {
    const query = chrome.tabs.query.bind(chrome.tabs)
    Object.assign(chrome.tabs, {
      query: async (info: chrome.tabs.QueryInfo) =>
        info.active ? [await chrome.tabs.get(id)] : query(info)
    })
  }, tabId)
  await panel.goto(extensionUrl(extension, 'pages/side-panel.html'))
  await panel.getByRole('tab', { name: labels.tabs.player }).click()
  const transcript = panel.getByRole('list', { name: videoTabLabels.transcript })
  await expect(transcript.locator('[data-line]')).toHaveCount(4)
  return { panel, transcript }
}

test('a word clicked in the transcript opens its card on the watch page, beside the panel and level with its row, with none in the panel', async ({
  extension,
  page
}) => {
  await openAt(page, 1)
  const { panel, transcript } = await panelBeside(extension, await watchTab(extension))
  const word = transcript.locator('[data-line] [data-source] [data-word="要求"]').last()
  await expect(word).toBeVisible()
  const row = (await word.boundingBox()) ?? { y: 0 }
  await word.click()
  const card = page.getByRole('dialog', { name: fill(wordPopupLabels.word, { name: '要求' }) })
  await expect(card.locator('[data-meaning]').first()).toContainText('demand')
  await expect(panel.locator('[data-word-popup]')).toHaveCount(0)

  const box = (await card.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }
  const view = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: window.innerHeight
  }))
  expect(box.x + box.width).toBeCloseTo(view.width - margin, 0)
  const level = Math.min(Math.max(row.y, margin), view.height - margin - box.height)
  expect(box.y).toBeCloseTo(level, 0)

  await panel.keyboard.press('Escape')
  await expect(wordPopup(page)).toHaveCount(0)

  await word.click()
  await expect(card).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(wordPopup(page)).toHaveCount(0)
  await word.click()
  await expect(card).toBeVisible()
  await expect(panel.locator('[data-word-popup]')).toHaveCount(0)
})

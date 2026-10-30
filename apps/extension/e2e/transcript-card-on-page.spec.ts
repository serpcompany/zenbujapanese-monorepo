import type { Locator } from '@playwright/test'
import { fill } from '@zenbu/dictionary-core/detail/template'
import { playerCaptionLabels } from '../src/player-captions/labels.ts'
import { labels } from '../src/side-panel/labels.ts'
import { videoTabLabels } from '../src/video-tab/labels.ts'
import { wordPopupLabels } from '../src/word-popup/labels.ts'
import { type Extension, expect, extensionUrl, test } from './fixtures.ts'
import { caption, openAt, overlay, videoState } from './watch-page.ts'
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

const transcriptWord = (transcript: Locator) =>
  transcript.locator('[data-line] [data-source] [data-word="要求"]').last()

test('with Every Site given, one card answers a transcript word on YouTube, and Escape in the panel closes it', async ({
  extension,
  page
}) => {
  await openAt(page, 1)
  const tabId = await watchTab(extension)
  await extension.serviceWorker.evaluate(
    id => chrome.scripting.executeScript({ target: { tabId: id }, files: ['page-lookup.js'] }),
    tabId
  )
  const { panel, transcript } = await panelBeside(extension, tabId)
  await transcriptWord(transcript).click()
  await expect(wordPopup(page)).toHaveCount(1)
  await panel.keyboard.press('Escape')
  await expect(wordPopup(page)).toHaveCount(0)
})

test('a caption word clicked over a transcript word’s card takes its place, and the video stays paused until that card closes', async ({
  extension,
  page
}) => {
  await openAt(page, 1)
  const { transcript } = await panelBeside(extension, await watchTab(extension))
  await overlay(page).getByRole('button', { name: playerCaptionLabels.play }).click()
  await expect(overlay(page).getByRole('button', { name: playerCaptionLabels.pause })).toBeVisible()
  await transcriptWord(transcript).click()
  await expect(wordPopup(page)).toHaveCount(1)
  await expect.poll(async () => (await videoState(page)).paused).toBe(true)
  await page.evaluate(() => {
    const video = document.querySelector('video')
    if (!video) throw new Error('No video')
    document.body.dataset.plays = '0'
    video.addEventListener('play', () => {
      document.body.dataset.plays = String(Number(document.body.dataset.plays) + 1)
    })
    video.currentTime = 1
  })
  await caption(page).locator('[data-word="要求"]').click()
  await expect(wordPopup(page)).toHaveCount(1)
  expect((await videoState(page)).paused).toBe(true)
  await page.keyboard.press('Escape')
  await expect(wordPopup(page)).toHaveCount(0)
  await expect.poll(async () => (await videoState(page)).paused).toBe(false)
  await expect.poll(() => page.evaluate(() => document.body.dataset.plays)).toBe('1')
  await page.evaluate(() => document.querySelector('video')?.pause())
})

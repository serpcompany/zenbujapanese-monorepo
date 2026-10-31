import type { Locator, Page } from '@playwright/test'
import { fill } from '@zenbu/dictionary-core/detail/template'
import { labels } from '../src/side-panel/labels.ts'
import { videoTabLabels } from '../src/video-tab/labels.ts'
import { wordPopupLabels } from '../src/word-popup/labels.ts'
import { type Extension, expect, extensionUrl } from './fixtures.ts'

export const watchTab = (extension: Extension) =>
  extension.serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://www.youtube.com/watch*' })
    return tab?.id ?? -1
  })

export async function panelBeside(extension: Extension, tabId: number) {
  const panel = await extension.context.newPage()
  await panel.setViewportSize({ width: 380, height: 720 })
  await panel.addInitScript(id => {
    Object.assign(globalThis, { Translator: { availability: async () => 'downloadable' } })
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

export const transcriptWord = (transcript: Locator) =>
  transcript.locator('[data-line] [data-source] [data-word="要求"]').last()

export const sheetOf = (panel: Page) => panel.locator('[data-word-sheet]')

export const sheetCard = (panel: Page) =>
  sheetOf(panel).getByRole('dialog', { name: fill(wordPopupLabels.word, { name: '要求' }) })

export async function openStatus(panel: Page, transcript: Locator) {
  await transcriptWord(transcript).click()
  await sheetCard(panel)
    .getByRole('button', { name: fill(wordPopupLabels.share.moreActions, { name: '要求' }) })
    .click()
  await expect(panel.getByRole('menuitemradio')).toHaveText(['Unknown', 'Learning', 'Known'])
}

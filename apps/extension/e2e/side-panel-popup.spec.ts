import type { Page } from '@playwright/test'
import { labels } from '../src/side-panel/labels.ts'
import { translateLabels } from '../src/translate/labels.ts'
import { type Extension, expect, extensionUrl, test } from './fixtures.ts'
import {
  expectWordsApartWithMeaningsOffAndOn,
  setWordMeanings,
  wordsStartingALineOrAfterText
} from './word-underlines.ts'

const narrowestPanel = { width: 360, height: 720 }

async function translateInPanel(page: Page, extension: Extension, source: string) {
  await page.setViewportSize(narrowestPanel)
  await page.addInitScript(() => {
    Object.assign(globalThis, { Translator: { availability: async () => 'available' } })
    const send = chrome.runtime.sendMessage.bind(chrome.runtime)
    const answer = (...sent: Parameters<typeof send>) =>
      (sent[0] as { translation?: { type?: string } })?.translation?.type === 'translate'
        ? Promise.resolve({ type: 'translated', texts: ['I need a request.'] })
        : send(...sent)
    Object.assign(chrome.runtime, { sendMessage: answer })
  })
  await page.goto(extensionUrl(extension, 'pages/side-panel.html'))
  await page.getByRole('tab', { name: labels.tabs.translate }).click()
  await page.getByRole('textbox', { name: translateLabels.box }).fill(source)
  await page.getByRole('button', { name: translateLabels.translate, exact: true }).click()
  return page.locator('[data-translation-card]')
}

async function openPopupInPanel(page: Page, extension: Extension) {
  await translateInPanel(page, extension, '要求が要る。')
  await page.locator('[data-source] [data-word="要求"]').first().click()
  const popup = page.locator('[data-word-popup]')
  await expect(popup.locator('[data-headword]')).toContainText('要求')
  return popup
}

test('where the page can’t show a word’s card, its popup opens in the side panel and stays inside it at its narrowest width', async ({
  extension,
  page
}) => {
  const popup = await openPopupInPanel(page, extension)
  const edges = await popup.evaluate(element => {
    const inside = [element, ...element.querySelectorAll('button')].map(each => {
      const box = each.getBoundingClientRect()
      return box.left >= 0 && box.right <= document.documentElement.clientWidth
    })
    return {
      inside: inside.every(Boolean),
      scrollsSideways: element.scrollWidth > element.clientWidth,
      pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth
    }
  })
  expect(edges).toEqual({ inside: true, scrollsSideways: false, pageScrollsSideways: false })
})

test('starts each line of a wrapped Japanese source at its first word, with no space after leading punctuation, with Word Meanings off and on', async ({
  extension,
  page
}) => {
  const words = Array.from({ length: 5 }, () => ['要所', '要所', '要求']).flat()
  const card = await translateInPanel(page, extension, `……${words.join('')}`)
  const source = card.locator('[data-source]')
  await expectWordsApartWithMeaningsOffAndOn(extension, card, [words])
  for (const on of [false, true]) {
    await setWordMeanings(extension, card, on)
    const starts = await wordsStartingALineOrAfterText(source)
    expect(starts[0]).toMatchObject({ word: '要所', after: 'text' })
    expect(starts.filter(start => start.after === 'line start').length).toBeGreaterThan(0)
    for (const start of starts) expect(Math.abs(start.lead), start.word).toBeLessThan(1)
  }
  await setWordMeanings(extension, card, false)
})

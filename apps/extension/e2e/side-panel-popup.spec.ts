import type { Page } from '@playwright/test'
import { labels } from '../src/side-panel/labels.ts'
import { translateLabels } from '../src/translate/labels.ts'
import { type Extension, expect, extensionUrl, test } from './fixtures.ts'

const narrowestPanel = { width: 360, height: 720 }

async function openPopupInPanel(page: Page, extension: Extension) {
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
  await page.getByRole('textbox', { name: translateLabels.box }).fill('要求が要る。')
  await page.getByRole('button', { name: translateLabels.translate, exact: true }).click()
  await page.locator('[data-source] [data-word="要求"]').first().click()
  const popup = page.locator('[data-word-popup]')
  await expect(popup.locator('[data-headword]')).toContainText('要求')
  return popup
}

test('a word’s popup in the side panel stays inside the panel at its narrowest width', async ({
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

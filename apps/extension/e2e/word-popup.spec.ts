import type { Locator, Page } from '@playwright/test'
import { fill } from '@zenbu/dictionary-core/detail/template'
import { wordPopupLabels as labels } from '../src/word-popup/labels.ts'
import { type Extension, expect, test } from './fixtures.ts'
import {
  changeSettings,
  clickWord,
  defaultReadingAids,
  openWordsPage,
  pageWords,
  readingAidCases,
  tones,
  underlinedWords,
  wordPopup,
  wordUrl
} from './words-page.ts'

type Recorded = { opens: string[]; routes: unknown[] }

async function recordPanelOpens(extension: Extension) {
  await extension.serviceWorker.evaluate(() => {
    const scope = globalThis as unknown as { panel?: Recorded }
    if (scope.panel) {
      scope.panel.opens = []
      scope.panel.routes = []
      return
    }
    const panel: Recorded = { opens: [], routes: [] }
    scope.panel = panel
    const open = chrome.sidePanel.open.bind(chrome.sidePanel)
    chrome.sidePanel.open = options =>
      open(options).then(
        () => {
          panel.opens.push('opened')
        },
        (error: Error) => {
          panel.opens.push(error.message)
          throw error
        }
      )
    chrome.runtime.onMessage.addListener(message => {
      if (typeof message === 'object' && message !== null && 'openPanel' in message) {
        panel.routes.push(message.openPanel)
      }
    })
  })
}

const panelOpens = (extension: Extension) =>
  extension.serviceWorker.evaluate(() => (globalThis as unknown as { panel: Recorded }).panel)

const sidePanels = (extension: Extension) =>
  extension.serviceWorker.evaluate(async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.SIDE_PANEL]
    })
    return contexts.length
  })

async function readyPage(page: Page, extension: Extension, tone: 'light' | 'dark' = 'light') {
  await openWordsPage(page, extension, tone)
  await expect
    .poll(async () => Object.keys((await underlinedWords(page))[tone]).sort())
    .toEqual(Object.keys(pageWords).sort())
}

const geistLoaded = (page: Page) =>
  page.evaluate(async () => {
    await document.fonts.load('16px "Zenbu Geist"', 'Zenbu')
    const geist = [...document.fonts].filter(font => font.family.includes('Zenbu Geist'))
    return geist.length > 0 && geist.some(font => font.status === 'loaded')
  })

const popupFor = (page: Page, name: string) =>
  page.getByRole('dialog', { name: fill(labels.word, { name }) })

for (const { name, aids } of readingAidCases) {
  test.describe(name, () => {
    test.beforeEach(async ({ extension }) => {
      await changeSettings(extension, aids)
    })

    for (const tone of tones) {
      test(`a click on a word opens its popup with headword, reading, pitch, badges and meanings on a ${tone} page`, async ({
        extension,
        page
      }) => {
        await readyPage(page, extension, tone)
        await clickWord(page, '#sentence', '要求')
        const popup = popupFor(page, '要求')
        await expect(popup.locator('[data-headword]')).toContainText('要求')
        const readings = await popup
          .locator('[data-headword] [data-reading]')
          .evaluateAll(spans => spans.map(span => span.getAttribute('data-reading')).join(''))
        expect(readings).toBe('ようきゅう')
        await expect(popup.locator('[data-pitch-graph]')).toBeVisible()
        await expect(popup.locator('[data-chip]').first()).toContainText('N3')
        await expect(popup.locator('[data-chip]').nth(1)).toContainText(/3,?195/)
        await expect(popup.locator('[data-meaning]').first()).toContainText('demand')
        await expect.poll(() => geistLoaded(page)).toBe(true)
      })
    }

    test('Open Full Entry sends Word Detail and the entry, and opens the closed side panel', async ({
      extension,
      page
    }) => {
      await recordPanelOpens(extension)
      await readyPage(page, extension)
      await clickWord(page, '#sentence', '要求')
      await popupFor(page, '要求').getByRole('button', { name: labels.openFullEntry }).click()
      await expect
        .poll(() => panelOpens(extension))
        .toEqual({ routes: [{ page: { page: 'word', entSeq: 1546680 } }], opens: ['opened'] })
      await expect(wordPopup(page)).toHaveCount(0)
      await expect.poll(() => sidePanels(extension)).toBe(1)
    })

    test('several entries open on a choice, the one the sentence links first, and Open Full Entry offers them all', async ({
      extension,
      page
    }) => {
      await recordPanelOpens(extension)
      await readyPage(page, extension)
      await clickWord(page, '#choice', '要')
      const choice = page.getByRole('dialog', { name: fill(labels.choose, { name: '要' }) })
      const entries = choice.locator('[data-choice]')
      await expect(entries).toHaveCount(2)
      expect(
        await entries.evaluateAll(found => found.map(entry => entry.getAttribute('data-choice')))
      ).toEqual(['2188720', '1609600'])
      await expect(entries.first()).toContainText('よう')
      await choice.locator('[data-choice="2188720"]').click()
      const popup = popupFor(page, '要')
      await expect(popup.locator('[data-word-card="2188720"]')).toBeVisible()
      await popup.getByRole('button', { name: labels.back }).click()
      await page.locator('[data-choice="1609600"]').click()
      await popup.getByRole('button', { name: labels.openFullEntry }).click()
      await expect
        .poll(async () => (await panelOpens(extension)).routes)
        .toEqual([{ page: { page: 'word', entSeq: 1609600, entries: [2188720, 1609600] } }])
    })

    test('the popup stays inside the window for a word at each edge, and follows the page as it scrolls until its word is gone', async ({
      extension,
      page
    }) => {
      await readyPage(page, extension)
      const viewport = page.viewportSize() ?? { width: 0, height: 0 }
      const inside = async (popup: Locator) => {
        const box = await popup.boundingBox()
        return (
          box !== null &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= viewport.width &&
          box.y + box.height <= viewport.height
        )
      }
      for (const edge of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
        await page.locator('.edges').evaluate(edges => edges.scrollIntoView())
        await page.locator(`#${edge}`).click()
        const popup = popupFor(page, '要求')
        await expect(popup.locator('[data-meaning]').first()).toBeVisible()
        await expect.poll(() => inside(popup), edge).toBe(true)
        await page.keyboard.press('Escape')
        await expect(wordPopup(page)).toHaveCount(0)
      }
      await page.evaluate(() => window.scrollTo(0, 0))
      await clickWord(page, '#sentence', '要求')
      const popup = popupFor(page, '要求')
      await expect(popup.locator('[data-meaning]').first()).toBeVisible()
      const before = (await popup.boundingBox())?.y ?? 0
      await page.evaluate(() => window.scrollBy(0, 40))
      await expect.poll(async () => (await popup.boundingBox())?.y).toBeCloseTo(before - 40, 0)
      await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      await expect(wordPopup(page)).toHaveCount(0)
    })

    test('a click on the words of a checkbox label or a summary works the control and opens no popup', async ({
      extension,
      page
    }) => {
      await readyPage(page, extension)
      await clickWord(page, '#agree', '要求')
      await expect(page.locator('#agree-box')).toBeChecked()
      await clickWord(page, '#more-summary', '要領')
      await expect(page.locator('#more')).toHaveAttribute('open', '')
      await expect(wordPopup(page)).toHaveCount(0)
    })

    test('closes on Escape, Close and a click outside, and gives focus back', async ({
      extension,
      page
    }) => {
      await readyPage(page, extension)
      await page.locator('#word-link').click()
      await expect(popupFor(page, '要領')).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(wordPopup(page)).toHaveCount(0)
      await expect(page.locator('#word-link')).toBeFocused()

      await clickWord(page, '#sentence', '要求')
      await popupFor(page, '要求').getByRole('button', { name: labels.close }).click()
      await expect(wordPopup(page)).toHaveCount(0)

      await clickWord(page, '#sentence', '要求')
      await expect(popupFor(page, '要求')).toBeVisible()
      await page.locator('#outside').click()
      await expect(wordPopup(page)).toHaveCount(0)
    })

    test('a word in a link opens the popup and leaves the address alone, and the link still follows on a modified or middle click and on Enter', async ({
      extension,
      page
    }) => {
      await readyPage(page, extension)
      const address = page.url()
      const link = page.locator('#word-link')
      await link.click()
      await expect(popupFor(page, '要領')).toBeVisible()
      expect(page.url()).toBe(address)
      await page.keyboard.press('Escape')

      for (const click of [
        { modifiers: ['ControlOrMeta' as const] },
        { button: 'middle' as const }
      ]) {
        const opened = extension.context.waitForEvent('page')
        await link.click(click)
        const tab = await opened
        expect(tab.url()).toMatch(/#followed$/)
        await tab.close()
      }
      await expect(wordPopup(page)).toHaveCount(0)

      await link.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/#followed$/)
      await expect(wordPopup(page)).toHaveCount(0)
    })

    test('Share and Copy Link put the word’s address on the clipboard where there is no share sheet', async ({
      extension,
      page
    }) => {
      await extension.context.grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin: extension.server.allowedSiteUrl
      })
      await readyPage(page, extension)
      const address = wordUrl('要求', 'ようきゅう', 1546680)
      const clipboard = () => page.evaluate(() => navigator.clipboard.readText())

      await clickWord(page, '#sentence', '要求')
      const popup = popupFor(page, '要求')
      await popup.getByRole('button', { name: fill(labels.share.share, { name: '要求' }) }).click()
      await expect(popup.getByText(labels.share.linkCopied)).toBeVisible()
      expect(await clipboard()).toBe(address)

      await page.evaluate(() => navigator.clipboard.writeText(''))
      await popup
        .getByRole('button', { name: fill(labels.share.moreActions, { name: '要求' }) })
        .click()
      await page.getByRole('menuitem', { name: labels.share.copyLink }).click()
      await expect.poll(clipboard).toBe(address)
      await expect(popup).toBeVisible()
    })
  })
}

test('a click on the furigana over a word in a link opens the word’s popup and leaves the address alone', async ({
  extension,
  page
}) => {
  await changeSettings(extension, defaultReadingAids)
  await readyPage(page, extension)
  const address = page.url()
  const reading = page.locator('#word-link rt').first()
  await expect(reading).toBeVisible()
  await reading.click()
  await expect(popupFor(page, '要領')).toBeVisible()
  expect(page.url()).toBe(address)
})

import type { Page } from '@playwright/test'
import { type Extension, expect, test } from './fixtures.ts'
import {
  addedWords,
  addWordLater,
  allowedHost,
  changeSettings,
  clickWord,
  darkTextColours,
  highlightNames,
  noReadingAids,
  openWordsPage,
  pageLayout,
  pageWords,
  tones,
  underlineColors,
  underlinedWords,
  underlineRules,
  wordPopup
} from './words-page.ts'

const siteOff = { ...noReadingAids, 'sites.off': [allowedHost] }

const underlinesIn = async (page: Page) => (await underlinedWords(page)).light

async function openMarkedPage(page: Page, extension: Extension) {
  await openWordsPage(page, extension, 'light')
  await expect.poll(() => underlinesIn(page)).toEqual(pageWords)
  await page.evaluate(() => Object.assign(window, { notReloaded: true }))
}

test.beforeEach(async ({ extension }) => {
  await changeSettings(extension, noReadingAids)
})

for (const tone of tones) {
  const other = tone === 'light' ? 'dark' : 'light'

  test(`underlines the words segment links on a ${tone} page, and nothing in nav or a fixed bar`, async ({
    extension,
    page
  }) => {
    await openWordsPage(page, extension, tone)
    await expect.poll(() => underlinedWords(page)).toEqual({ [tone]: pageWords, [other]: {} })
    const rule = (await underlineRules(page)).find(text =>
      text.includes(`::highlight(${highlightNames[tone]})`)
    )
    expect(rule).toContain(underlineColors[tone])
    expect(rule).toContain('2px')
  })

  test(`leaves every element's box and colour as they are on a ${tone} page`, async ({
    extension,
    page
  }) => {
    await changeSettings(extension, siteOff)
    await openWordsPage(page, extension, tone)
    const off = await pageLayout(page)
    await changeSettings(extension, noReadingAids)
    await expect.poll(async () => Object.keys((await underlinedWords(page))[tone])).not.toEqual([])
    expect(await pageLayout(page)).toEqual(off)
  })
}

for (const colour of darkTextColours) {
  test(`underlines in the dark page's colour when the page's text is ${colour}`, async ({
    extension,
    page
  }) => {
    await openWordsPage(page, extension, 'dark', colour)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).color)).toBe(colour)
    await expect.poll(() => underlinedWords(page)).toEqual({ dark: pageWords, light: {} })
  })
}

test('shows furigana, romaji and word meanings when each is turned on, and takes them away when it is off, without a reload', async ({
  extension,
  page
}) => {
  await openMarkedPage(page, extension)
  const sentence = page.locator('#sentence')

  await changeSettings(extension, { 'readingAids.furigana': true })
  await expect(sentence.locator('rt')).toHaveText(['ようきゅう', 'い'])
  await changeSettings(extension, { 'readingAids.furigana': false })
  await expect(sentence.locator('rt')).toHaveCount(0)

  await changeSettings(extension, { 'readingAids.romaji': true })
  await expect(sentence.locator('[data-zenbu-aid="romaji"]')).toHaveText('youkyuu ga iru。')
  await changeSettings(extension, { 'readingAids.romaji': false })
  await expect(sentence.locator('[data-zenbu-aid="romaji"]')).toHaveCount(0)

  await changeSettings(extension, { 'readingAids.wordMeanings': true })
  await expect(sentence.locator('[data-zenbu-aid="meaning"]').first()).toHaveText(/demand/)
  await changeSettings(extension, { 'readingAids.wordMeanings': false })
  await expect(sentence.locator('[data-zenbu-aid="meaning"]')).toHaveCount(0)

  await expect(sentence).toHaveText('要求が要る。')
  await expect.poll(() => underlinesIn(page)).toEqual(pageWords)
  expect(await page.evaluate(() => 'notReloaded' in window)).toBe(true)
})

test('underlines nothing and opens no popup on a site turned off, and starts when it is turned back on', async ({
  extension,
  page
}) => {
  await changeSettings(extension, siteOff)
  await openWordsPage(page, extension, 'light')
  await clickWord(page, '#sentence', '要求')
  await changeSettings(extension, { 'readingAids.furigana': true })
  await expect(page.locator('#sentence rt')).toHaveCount(0)
  expect(await underlinedWords(page)).toEqual({ light: {}, dark: {} })
  await expect(wordPopup(page)).toHaveCount(0)

  await changeSettings(extension, { 'sites.off': [] })
  await expect(page.locator('#sentence rt')).toHaveText(['ようきゅう', 'い'])
  await changeSettings(extension, siteOff)
  await expect(page.locator('#sentence rt')).toHaveCount(0)
  await expect.poll(() => underlinedWords(page)).toEqual({ light: {}, dark: {} })
})

test('underlines words added to the page later', async ({ extension, page }) => {
  await openWordsPage(page, extension, 'light')
  await expect.poll(() => underlinesIn(page)).toEqual(pageWords)
  await addWordLater(page)
  await expect.poll(() => underlinesIn(page)).toEqual(addedWords)
})

test('underlines words added to a long page before the rest of its first scan', async ({
  extension,
  page
}) => {
  await changeSettings(extension, noReadingAids)
  const line = '<a href="#">要求</a>は要る。<b>要所</b>と要領と要項。'.repeat(3)
  const lines = Array.from({ length: 3000 }, () => `<p>${line}</p>`).join('')
  const longPage = `<!doctype html><html lang="ja"><body><main id="long">${lines}</main></body></html>`
  await page.route('**/test-pages/long.html', route =>
    route.fulfill({ body: longPage, contentType: 'text/html; charset=utf-8' })
  )
  const underlined = () =>
    page.evaluate(name => {
      const ranges = [...(CSS.highlights.get(name) ?? [])] as Range[]
      const added = ranges.filter(range => range.startContainer.parentElement?.id === 'added')
      return { all: ranges.length, added: added.map(range => range.toString()) }
    }, highlightNames.light)
  await page.goto(`${extension.server.allowedSiteUrl}/test-pages/long.html`)
  await expect.poll(async () => (await underlined()).all).toBeGreaterThan(0)
  await page.evaluate(() => {
    const added = Object.assign(document.createElement('p'), { id: 'added', textContent: '要項' })
    document.querySelector('#long')?.prepend(added)
  })
  await expect.poll(async () => (await underlined()).added, { timeout: 10_000 }).toEqual(['要項'])
  expect((await underlined()).all).toBeLessThan(3000 * 15)
})

async function siteAccess(page: Page, extensionId: string, method: string) {
  return page.evaluate(
    ([id, name, pattern]) =>
      new Promise<string>(resolve => {
        type Change = (extension: string, host: string, done: () => void) => void
        const access = (chrome as unknown as Record<string, Record<string, Change>>)
          .developerPrivate
        access[name](id, pattern, () => resolve(chrome.runtime.lastError?.message ?? 'ok'))
      }),
    [extensionId, method, `http://${allowedHost}/*`]
  )
}

test('starts on an open page when Chrome grants its site, and stops when the site is taken back', async ({
  extension,
  page
}) => {
  await openMarkedPage(page, extension)
  const settings = await extension.context.newPage()
  await settings.goto('chrome://extensions')
  try {
    expect(await siteAccess(settings, extension.id, 'removeHostPermission')).toBe('ok')
    await expect.poll(() => underlinesIn(page)).toEqual({})
    await clickWord(page, '#sentence', '要求')
    await expect(wordPopup(page)).toHaveCount(0)
  } finally {
    expect(await siteAccess(settings, extension.id, 'addHostPermission')).toBe('ok')
    await settings.close()
  }
  await expect.poll(() => underlinesIn(page)).toEqual(pageWords)
  expect(await page.evaluate(() => 'notReloaded' in window)).toBe(true)
})

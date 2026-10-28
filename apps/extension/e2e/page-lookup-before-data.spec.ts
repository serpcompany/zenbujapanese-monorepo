import { expect, test } from './fixtures.ts'
import {
  changeSettings,
  clickWord,
  noReadingAids,
  openWordsPage,
  pageWords,
  underlinedWords,
  wordPopup
} from './words-page.ts'

test.use({ languageDataHeld: true })

test('underlines nothing and takes no click until the language data is in', async ({
  extension,
  page
}) => {
  await changeSettings(extension, noReadingAids)
  await openWordsPage(page, extension, 'light')
  await page.waitForTimeout(2_000)
  expect(await underlinedWords(page)).toEqual({ light: {}, dark: {} })
  await clickWord(page, '#sentence', '要求')
  await expect(wordPopup(page)).toHaveCount(0)
  extension.server.releaseLanguageData()
  await expect
    .poll(async () => (await underlinedWords(page)).light, { timeout: 60_000 })
    .toEqual(pageWords)
})

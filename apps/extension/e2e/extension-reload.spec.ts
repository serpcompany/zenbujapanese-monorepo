import { type Extension, expect, extensionUrl, test } from './fixtures.ts'
import {
  addedWords,
  addWordLater,
  changeSettings,
  clickWord,
  noReadingAids,
  openWordsPage,
  pageWords,
  underlinedWords,
  wordPopup
} from './words-page.ts'

test.use({ reloads: true })

type DeveloperTools = {
  updateProfileConfiguration(update: { inDeveloperMode: boolean }): void
  reload(extension: string, options: { failQuietly: boolean }, done: () => void): void
}

async function reloadExtension(extension: Extension) {
  const extensions = await extension.context.newPage()
  await extensions.goto('chrome://extensions')
  const answer = await extensions.evaluate(
    id =>
      new Promise<string>(resolve => {
        const developer = (chrome as unknown as { developerPrivate: DeveloperTools })
          .developerPrivate
        developer.updateProfileConfiguration({ inDeveloperMode: true })
        developer.reload(id, { failQuietly: true }, () =>
          resolve(chrome.runtime.lastError?.message ?? 'ok')
        )
      }),
    extension.id
  )
  expect(answer).toBe('ok')
  await expect
    .poll(async () => {
      await extensions.goto(extensionUrl(extension, 'pages/settings.html')).catch(() => null)
      return extensions.evaluate(() => chrome.runtime?.id).catch(() => undefined)
    })
    .toBe(extension.id)
  await extensions.close()
}

test('an open page underlines new text and opens popups again after the extension reloads, with no reload of its own', async ({
  extension,
  page
}) => {
  await changeSettings(extension, noReadingAids)
  await openWordsPage(page, extension, 'light')
  await expect.poll(async () => (await underlinedWords(page)).light).toEqual(pageWords)
  await page.evaluate(() => Object.assign(window, { notReloaded: true }))
  await reloadExtension(extension)
  await addWordLater(page)
  await expect.poll(async () => (await underlinedWords(page)).light).toEqual(addedWords)
  await clickWord(page, '#sentence', '要求')
  await expect(wordPopup(page).locator('[data-headword]')).toContainText('要求')
  expect(await page.evaluate(() => 'notReloaded' in window)).toBe(true)
})

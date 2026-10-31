import { dictionaryLabels, testPage } from './expected.ts'
import { closeOffscreenDocument, contentScriptSurface, expect, test } from './fixtures.ts'

test('the test content script draws the test surface on a local page, and the dictionary answers it', async ({
  extension,
  page
}) => {
  await page.goto(`${extension.server.url}${testPage}`)
  const surface = contentScriptSurface(page)
  await expect(surface.getByText('食べる')).toBeVisible()
  await expect(surface.getByText(dictionaryLabels.ready)).toBeVisible()
})

test('the dictionary answers the test surface again after Chrome closes the offscreen document', async ({
  extension,
  page
}) => {
  await page.goto(`${extension.server.url}${testPage}`)
  const surface = contentScriptSurface(page)
  await expect(surface.getByText(dictionaryLabels.ready)).toBeVisible()
  await closeOffscreenDocument(extension)
  await surface.getByRole('button', { name: dictionaryLabels.checkAgain }).click()
  await expect(surface.getByText(dictionaryLabels.ready)).toBeVisible()
})

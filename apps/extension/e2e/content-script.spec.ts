import { dictionaryLabels, testPage } from './expected.ts'
import { contentScriptSurface, expect, test } from './fixtures.ts'

test('the test content script draws the test surface on a local page, and the dictionary answers it', async ({
  extension,
  page
}) => {
  await page.goto(`${extension.server.url}${testPage}`)
  const surface = contentScriptSurface(page)
  await expect(surface.getByText('食べる')).toBeVisible()
  await expect(surface.getByText(dictionaryLabels.ready)).toBeVisible()
})

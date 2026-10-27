import { dictionaryLabels, extensionPages, manifestValue } from './expected.ts'
import { closeOffscreenDocument, expect, extensionUrl, test } from './fixtures.ts'

for (const expected of extensionPages) {
  test(`the ${expected.name} page is in the build, and the manifest opens it`, async ({
    extension,
    page
  }) => {
    expect(manifestValue(extension.manifest, expected.manifestKey)).toBe(expected.path)
    const response = await page.goto(extensionUrl(extension, expected.path))
    expect(response?.ok()).toBe(true)
    await expect(page.getByRole('heading', { name: expected.title })).toBeVisible()
    await expect(page.getByText(expected.text)).toBeVisible()
  })
}

test('the dictionary answers the side panel again after Chrome closes the offscreen document', async ({
  extension,
  page
}) => {
  await page.goto(extensionUrl(extension, 'pages/side-panel.html'))
  await expect(page.getByText(dictionaryLabels.ready)).toBeVisible()
  await closeOffscreenDocument(extension)
  await page.getByRole('button', { name: dictionaryLabels.checkAgain }).click()
  await expect(page.getByText(dictionaryLabels.ready)).toBeVisible()
})

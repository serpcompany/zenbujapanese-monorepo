import { extensionPages, manifestValue } from './expected.ts'
import { expect, extensionUrl, test } from './fixtures.ts'

for (const expected of extensionPages) {
  test(`the ${expected.name} page is in the build, and the manifest opens it`, async ({
    extension,
    page
  }) => {
    expect(manifestValue(extension.manifest, expected.manifestKey)).toBe(expected.path)
    const response = await page.goto(extensionUrl(extension, expected.path))
    expect(response?.ok()).toBe(true)
    await expect(page).toHaveTitle(expected.documentTitle)
    const heading = page.getByRole('heading', { name: expected.heading })
    await expect(heading).toBeAttached()
    if (expected.headingDrawn) await expect(heading).toBeVisible()
    await expect(page.getByText(expected.text)).toBeVisible()
  })
}

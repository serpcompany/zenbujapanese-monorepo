import { checkedReleaseFile, downloadReleaseFile, releaseCheckFailures } from './expected.ts'
import { expect, extensionUrl, test } from './fixtures.ts'

test('an extension page downloads releases.json, the pinned manifest, and a file from the local server, and each SHA-256 matches', async ({
  extension,
  page
}) => {
  await page.goto(extensionUrl(extension, 'pages/settings.html'))
  const check = await page.evaluate(downloadReleaseFile, {
    base: extension.server.url,
    release: extension.server.release.release,
    name: checkedReleaseFile
  })
  expect(releaseCheckFailures(check)).toEqual([])
  expect(check.bytes).toBeGreaterThan(0)
})

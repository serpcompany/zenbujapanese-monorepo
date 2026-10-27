import { checkedReleaseFile, downloadReleaseFile } from './expected.ts'
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
  expect(check.manifestSha256).toBe(check.listedSha256)
  expect(check.fileSha256).toBe(check.pinnedSha256)
  expect(check.bytes).toBeGreaterThan(0)
})

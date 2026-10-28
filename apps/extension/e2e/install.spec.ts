import { type Compressed, fileKey, type ManifestFile, packed } from '../src/worker/release-files.ts'
import { dictionaryLabels } from './expected.ts'
import { expect, extensionUrl, test } from './fixtures.ts'

test('a new install downloads the fixture release, checks each part, installs it, and is ready', async ({
  extension,
  page
}) => {
  const { server } = extension
  await page.goto(extensionUrl(extension, 'pages/welcome.html'))
  await expect(page.getByText(dictionaryLabels.ready)).toBeVisible()
  const read = async <T>(key: string) => (await (await fetch(`${server.url}/${key}`)).json()) as T
  const release = `releases/${server.release}`
  const compressed = await read<Compressed>(`${release}/compressed.json`)
  const { files } = await read<{ files: ManifestFile[] }>(`${release}/manifest.json`)
  const parts = compressed.files.flatMap(file => file.parts.map(part => part.key))
  const whole = files.filter(file => !packed(file.name)).map(fileKey)
  expect(parts.length).toBeGreaterThan(compressed.files.length)
  const expected = [
    'releases.json',
    `${release}/manifest.json`,
    `${release}/compressed.json`,
    ...parts,
    ...whole
  ]
  await expect.poll(() => server.asked).toEqual(expect.arrayContaining(expected))
})

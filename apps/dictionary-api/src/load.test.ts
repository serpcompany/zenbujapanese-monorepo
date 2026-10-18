import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { retiredEntriesFile } from '@zenbu/dictionary-core/artifact/retired'
import { wordCardInputs } from '@zenbu/dictionary-core/artifact/word-cards'
import { afterEach, describe, expect, test } from 'vitest'
import { verifyFiles } from './load'

const release = '2026.10.2'
const folders: string[] = []

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

function languageData(pinned: (name: string) => string = sha256) {
  const root = mkdtempSync(join(tmpdir(), 'pinned-release-'))
  folders.push(root)
  const resources = join(root, 'resources')
  const derived = join(root, 'derived')
  mkdirSync(resources)
  mkdirSync(derived)
  for (const name of wordCardInputs) writeFileSync(join(resources, name), name)
  writeFileSync(join(derived, retiredEntriesFile), retiredEntriesFile)
  writeFileSync(join(root, 'release.json'), JSON.stringify({ release }))
  const releases = join(root, 'releases')
  mkdirSync(join(releases, release), { recursive: true })
  const files = [...wordCardInputs, retiredEntriesFile].map(name => ({
    name,
    sha256: pinned(name)
  }))
  writeFileSync(join(releases, release, 'manifest.json'), JSON.stringify({ release, files }))
  return {
    resources,
    languageDataRelease: join(root, 'release.json'),
    languageDataReleases: releases,
    languageDataDerived: derived,
    sudachiDictionary: null,
    release: 'test'
  }
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('the files the service starts on', () => {
  test("are the pinned release's, which it names with their SHA-256s", async () => {
    const files = languageData()
    const verified = await verifyFiles(files)
    expect(verified.languageDataRelease).toBe(release)
    expect(verified.languageDataFiles).toEqual(
      Object.fromEntries(wordCardInputs.map(name => [name, sha256(name)]))
    )
    expect(verified.retiredEntries).toBe(join(files.languageDataDerived, retiredEntriesFile))
  })

  test.each([
    'KanjiReferenceData.json',
    retiredEntriesFile
  ])("refuse to start when %s isn't the release's, naming it", async file => {
    const other = sha256('another build')
    const files = languageData(name => (name === file ? other : sha256(name)))
    await expect(verifyFiles(files)).rejects.toThrow(
      `These aren't language-data release ${release}'s files: ${file} is ${sha256(file)}, ` +
        `the release has ${other}`
    )
  })

  test('refuse to start without the release pinned', async () => {
    const files = { ...languageData(), languageDataReleases: join(tmpdir(), 'no-releases') }
    await expect(verifyFiles(files)).rejects.toThrow(
      `Language-data release ${release} has no pinned manifest at`
    )
  })
})

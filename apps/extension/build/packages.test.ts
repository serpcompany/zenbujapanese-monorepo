import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { builtPages } from './extension-config.ts'
import { type Environment, hosts, testLanguageDataHost, type Variant } from './hosts.ts'
import { extensionIdOf, storeKey } from './key.ts'
import { contentScriptFile, contentScripts, extensionVersion, manifest } from './manifest.ts'
import { type PackageKind, packageFolder, packageProblems } from './packages.ts'
import { unzipFiles, zipFiles } from './zip.ts'

type Files = Record<string, string>

const storeId = 'kaalpflpefadijdemimciikalgpgjmok'

function built(environment: Environment, variant: Variant = 'release', changes = {}): Files {
  return {
    'manifest.json': JSON.stringify({ ...manifest(variant, environment), ...changes }),
    'service-worker.js': 'chrome.runtime.onMessage.addListener(() => false)',
    ...Object.fromEntries(contentScripts('release').map(script => [contentScriptFile(script), ''])),
    'assets/popup.js': `fetch(${JSON.stringify(`${hosts[environment].api}/v1/health`)})`,
    ...Object.fromEntries(builtPages.map(page => [page, '<!doctype html>']))
  }
}

const zipOf = (files: Files) =>
  zipFiles(Object.entries(files).map(([path, data]) => ({ path, data: Buffer.from(data) })))

const problemsOf = (files: Files, kind: PackageKind, environment: Environment) =>
  packageProblems(zipOf(files), kind, environment)

const manifestIn = (zip: Buffer) =>
  JSON.parse(unzipFiles(zip).get('manifest.json')?.toString('utf8') ?? '{}')

let folder: string | undefined

async function folderOf(files: Files): Promise<string> {
  folder = await mkdtemp(join(tmpdir(), 'zenbu-package-'))
  for (const [path, data] of Object.entries(files)) {
    await mkdir(dirname(join(folder, path)), { recursive: true })
    await writeFile(join(folder, path), data)
  }
  return folder
}

afterEach(async () => {
  if (folder) await rm(folder, { recursive: true, force: true })
  folder = undefined
})

describe('the packages a build makes', () => {
  it("passes the production build's store package, above the store's 1.1.0 and with no key", async () => {
    const zip = await packageFolder('store', await folderOf(built('production')))
    expect(packageProblems(zip, 'store', 'production')).toEqual([])
    expect(manifestIn(zip)).not.toHaveProperty('key')
    expect(manifestIn(zip).homepage_url).toBe('https://zenbujapanese.com')
  })

  it("passes the staging build's unpacked package, whose key gives the store item's ID", async () => {
    const zip = await packageFolder('unpacked', await folderOf(built('staging')))
    expect(packageProblems(zip, 'unpacked', 'staging')).toEqual([])
    expect(extensionIdOf(manifestIn(zip).key)).toBe(storeId)
    expect(manifestIn(zip).homepage_url).toBe('https://staging.zenbujapanese.com')
  })
})

describe('the check of a package', () => {
  it('fails a store package with a key in it', () => {
    expect(problemsOf(built('production'), 'store', 'production')).toEqual([
      'The store package has a key: the Chrome Web Store gives the item its ID, and refuses one.'
    ])
  })

  it('fails a package holding a source map', () => {
    const files = {
      ...built('production', 'release', { key: undefined }),
      'assets/popup.js.map': '{}'
    }
    expect(problemsOf(files, 'store', 'production')).toEqual([
      'The package holds source maps: assets/popup.js.map.'
    ])
  })

  it("fails the version 1.1.0, the store's, and one that isn't package.json's", () => {
    const files = built('staging', 'release', { version: '1.1.0' })
    expect(problemsOf(files, 'unpacked', 'staging')).toEqual([
      `The manifest's version is 1.1.0, not package.json's ${extensionVersion}.`,
      "The version 1.1.0 isn't above 1.1.0, the Chrome Web Store's, so the store would refuse it as an update."
    ])
  })

  it("fails a package holding the test build's content script", () => {
    const files = { ...built('staging', 'test'), 'test-content-script.js': '' }
    expect(problemsOf(files, 'unpacked', 'staging')).toEqual([
      "The package holds the test build's test-content-script.js.",
      `the test build's ${testLanguageDataHost} is in manifest.json.`
    ])
  })

  it('fails a package missing a page', () => {
    const {
      'pages/settings.html': _settings,
      'service-worker.js': _worker,
      ...files
    } = built('staging')
    expect(problemsOf(files, 'unpacked', 'staging')).toEqual([
      'The package is missing pages/settings.html, service-worker.js.'
    ])
  })

  it("fails a package that names the other environment's hosts", () => {
    const files = {
      ...built('staging'),
      'assets/side-panel.js': 'open("https://zenbujapanese.com")'
    }
    expect(problemsOf(files, 'unpacked', 'staging')).toEqual([
      "production's https://zenbujapanese.com is in assets/side-panel.js."
    ])
    expect(problemsOf(built('staging'), 'unpacked', 'production')).toEqual([
      "The manifest's homepage_url is https://staging.zenbujapanese.com, not https://zenbujapanese.com.",
      "staging's https://staging.zenbujapanese.com is in manifest.json.",
      "staging's https://api-staging.zenbujapanese.com is in assets/popup.js."
    ])
  })

  it("passes the language data host both environments share, and fails the test build's", () => {
    expect(problemsOf(built('production'), 'unpacked', 'production')).toEqual([])
    const files = {
      ...built('production'),
      'assets/worker.js': `fetch(${JSON.stringify(`${testLanguageDataHost}/releases.json`)})`
    }
    expect(problemsOf(files, 'unpacked', 'production')).toEqual([
      `the test build's ${testLanguageDataHost} is in assets/worker.js.`
    ])
  })

  it('fails a package whose build left a host setting unfilled', () => {
    const files = {
      ...built('staging'),
      'assets/side-panel.js': 'var e=__ZENBU_WEBSITE_ORIGIN__;open(e)'
    }
    expect(problemsOf(files, 'unpacked', 'staging')).toEqual([
      'The build left a __ZENBU_ setting unfilled in assets/side-panel.js.'
    ])
  })

  it("fails an unpacked package with no key, or with another item's key", () => {
    const otherKey = storeKey.replace('MIIBIjAN', 'MIIBIjAM')
    expect(
      problemsOf(built('staging', 'release', { key: undefined }), 'unpacked', 'staging')
    ).toEqual([`The unpacked package has no key, so its ID isn't ${storeId}.`])
    expect(
      problemsOf(built('staging', 'release', { key: otherKey }), 'unpacked', 'staging')
    ).toEqual([`The key gives the ID ${extensionIdOf(otherKey)}, not ${storeId}.`])
  })
})

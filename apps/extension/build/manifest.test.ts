import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json' with { type: 'json' }
import { extensionIdOf } from './key.ts'
import {
  builtContentScripts,
  contentScriptFile,
  iconFile,
  iconSizes,
  manifest,
  minimumChromeVersion
} from './manifest.ts'

describe('manifest', () => {
  it("declares Zenbu's logo as the extension's and the toolbar icon's at every size Chrome uses, in every build", () => {
    const named = Object.fromEntries(iconSizes.map(size => [size, iconFile(size)]))
    expect(iconSizes).toEqual([16, 32, 48, 128])
    for (const variant of ['release', 'test'] as const) {
      const built = manifest(variant)
      expect(built.icons).toEqual(named)
      expect(built.action.default_icon).toEqual(named)
    }
  })

  it('draws each icon from the brand folder at the size it is named for', () => {
    for (const size of iconSizes) {
      const png = readFileSync(
        new URL(`../../../assets/brand/extensions/icon-${size}.png`, import.meta.url)
      )
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size])
    }
  })

  const youTubeScript = {
    matches: ['https://www.youtube.com/*'],
    js: ['youtube.js'],
    run_at: 'document_idle'
  }

  it('ships only the YouTube content script in the release build', () => {
    const release = manifest('release')
    expect(release.content_scripts).toEqual([youTubeScript])
  })

  it('runs the test content script only on local test pages in the test build', () => {
    const test = manifest('test')
    expect(test.content_scripts).toEqual([
      youTubeScript,
      {
        matches: ['http://localhost/*', 'http://127.0.0.1/*'],
        js: ['test-content-script.js'],
        run_at: 'document_idle'
      }
    ])
  })

  it('builds the page lookup in every build, which the service worker registers for the sites the learner allows', () => {
    for (const variant of ['release', 'test'] as const) {
      expect(builtContentScripts(variant).map(contentScriptFile)).toContain('page-lookup.js')
    }
    expect(builtContentScripts('release').map(contentScriptFile)).not.toContain(
      'test-content-script.js'
    )
  })

  it('makes no file web accessible, so no page loads or probes the extension’s files, in every build', () => {
    for (const variant of ['release', 'test'] as const) {
      expect(manifest(variant)).not.toHaveProperty('web_accessible_resources')
    }
    expect(manifest('release').content_scripts[0].matches).toEqual(['https://www.youtube.com/*'])
  })

  it('needs a Chrome with the Translator API, asks only for what the offline dictionary, scripting, YouTube and signing in need, and asks for other sites only when the learner allows one', () => {
    const release = manifest('release')
    expect(Number(minimumChromeVersion)).toBeGreaterThanOrEqual(138)
    expect(release.minimum_chrome_version).toBe(minimumChromeVersion)
    expect(release.permissions).toEqual([
      'offscreen',
      'sidePanel',
      'storage',
      'activeTab',
      'unlimitedStorage',
      'alarms',
      'scripting',
      'declarativeNetRequestWithHostAccess',
      'identity'
    ])
    expect(release.optional_host_permissions).toEqual(['http://*/*', 'https://*/*'])
    expect(release.background).toEqual({ service_worker: 'service-worker.js', type: 'module' })
  })

  it("downloads the language data only from its one host, calls only its own build's API host, and runs SQLite as WebAssembly", () => {
    const release = manifest('release')
    expect(release.host_permissions).toEqual([
      'https://data.zenbujapanese.com/*',
      'https://api.zenbujapanese.com/*',
      'https://www.youtube.com/*'
    ])
    expect(manifest('release', 'staging').host_permissions).toEqual([
      'https://data.zenbujapanese.com/*',
      'https://api-staging.zenbujapanese.com/*',
      'https://www.youtube.com/*'
    ])
    expect(manifest('test').host_permissions).toEqual([
      'http://language-data.localhost/*',
      'http://account-api.localhost/*',
      'https://www.youtube.com/*',
      'http://allowed.localhost/*'
    ])
    expect(release.content_security_policy.extension_pages).toBe(
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
    )
  })

  it('has no toolbar popup, so a click on the toolbar icon opens the side panel', () => {
    for (const variant of ['release', 'test'] as const) {
      const built = manifest(variant)
      expect(built.action).not.toHaveProperty('default_popup')
      expect(built.side_panel).toEqual({ default_path: 'pages/side-panel.html' })
    }
  })

  it("gets the Chrome Web Store item's ID from its key, in every build", () => {
    for (const variant of ['release', 'test'] as const) {
      expect(extensionIdOf(manifest(variant).key)).toBe('kaalpflpefadijdemimciikalgpgjmok')
      expect(extensionIdOf(manifest(variant, 'staging').key)).toBe(
        'kaalpflpefadijdemimciikalgpgjmok'
      )
    }
  })

  it('takes its version from package.json', () => {
    expect(manifest('release').version).toBe(packageJson.version)
    expect(manifest('test', 'staging').version).toBe(packageJson.version)
  })

  it("lets only its own environment's website, and no other extension, message it; the test build also local pages", () => {
    expect(manifest('release').externally_connectable).toEqual({
      matches: ['https://zenbujapanese.com/*']
    })
    expect(manifest('release', 'staging').externally_connectable).toEqual({
      matches: ['https://staging.zenbujapanese.com/*']
    })
    expect(manifest('test').externally_connectable).toEqual({
      matches: ['https://zenbujapanese.com/*', 'http://localhost/*', 'http://127.0.0.1/*']
    })
    expect(manifest('release').externally_connectable).not.toHaveProperty('ids')
  })

  it("links to its own environment's website", () => {
    expect(manifest('release').homepage_url).toBe('https://zenbujapanese.com')
    expect(manifest('release', 'staging').homepage_url).toBe('https://staging.zenbujapanese.com')
  })
})

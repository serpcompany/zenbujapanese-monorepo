import { describe, expect, it } from 'vitest'
import packageJson from '../package.json' with { type: 'json' }
import { environments, hosts } from './hosts.ts'
import { extensionIdOf } from './key.ts'
import {
  builtContentScripts,
  contentScriptFile,
  manifest,
  minimumChromeVersion
} from './manifest.ts'

describe('manifest', () => {
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

  it('lets every site the learner may allow load the fonts the shadow root draws with', () => {
    expect(manifest('release').web_accessible_resources).toEqual([
      {
        resources: ['assets/*.woff2'],
        matches: ['http://*/*', 'https://*/*'],
        use_dynamic_url: true
      }
    ])
  })

  it('lets the caption on the YouTube player load the same fonts, in every build', () => {
    for (const variant of ['release', 'test'] as const) {
      const [fonts] = manifest(variant).web_accessible_resources
      expect(manifest(variant).web_accessible_resources).toHaveLength(1)
      expect(fonts.resources).toEqual(['assets/*.woff2'])
      expect(fonts.matches).toContain('https://*/*')
    }
    expect(manifest('release').content_scripts[0].matches).toEqual(['https://www.youtube.com/*'])
  })

  it('needs a Chrome with the Translator API, asks only for what the offline dictionary, scripting and YouTube need, and asks for other sites only when the learner allows one', () => {
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
      'declarativeNetRequestWithHostAccess'
    ])
    expect(release.optional_host_permissions).toEqual(['http://*/*', 'https://*/*'])
    expect(release.background).toEqual({ service_worker: 'service-worker.js', type: 'module' })
  })

  it('downloads the language data only from its one host, and runs SQLite as WebAssembly', () => {
    const release = manifest('release')
    expect(release.host_permissions).toEqual([
      'https://data.zenbujapanese.com/*',
      'https://www.youtube.com/*'
    ])
    expect(manifest('release', 'staging').host_permissions).toEqual([
      'https://data.zenbujapanese.com/*',
      'https://www.youtube.com/*'
    ])
    expect(manifest('test').host_permissions).toEqual([
      'http://language-data.localhost/*',
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
      expect(built.action).toEqual({ default_title: 'Zenbu Japanese' })
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

  it("links to its own environment's website, and names no API host until one is called", () => {
    expect(manifest('release').homepage_url).toBe('https://zenbujapanese.com')
    expect(manifest('release', 'staging').homepage_url).toBe('https://staging.zenbujapanese.com')
    for (const environment of environments) {
      const built = JSON.stringify(manifest('release', environment))
      for (const { api } of Object.values(hosts)) expect(built).not.toContain(api)
    }
  })
})

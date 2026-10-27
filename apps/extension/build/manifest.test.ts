import { describe, expect, it } from 'vitest'
import packageJson from '../package.json' with { type: 'json' }
import { environments, hosts } from './hosts.ts'
import { extensionIdOf } from './key.ts'
import { manifest, minimumChromeVersion } from './manifest.ts'

describe('manifest', () => {
  it('ships no content script in the release build', () => {
    const release = manifest('release')
    expect(release).not.toHaveProperty('content_scripts')
    expect(release).not.toHaveProperty('web_accessible_resources')
  })

  it('runs the test content script only on local test pages in the test build', () => {
    const test = manifest('test')
    expect(test.content_scripts).toEqual([
      {
        matches: ['http://localhost/*', 'http://127.0.0.1/*'],
        js: ['test-content-script.js'],
        run_at: 'document_idle'
      }
    ])
    expect(test.web_accessible_resources?.[0]?.resources).toEqual(['assets/*.woff2'])
  })

  it('needs a Chrome with the Translator API, and asks only for what the offline dictionary needs', () => {
    const release = manifest('release')
    expect(Number(minimumChromeVersion)).toBeGreaterThanOrEqual(138)
    expect(release.minimum_chrome_version).toBe(minimumChromeVersion)
    expect(release.permissions).toEqual([
      'offscreen',
      'sidePanel',
      'storage',
      'unlimitedStorage',
      'alarms'
    ])
    expect(release.background).toEqual({ service_worker: 'service-worker.js', type: 'module' })
  })

  it('downloads the language data only from its one host, and runs SQLite as WebAssembly', () => {
    const release = manifest('release')
    expect(release.host_permissions).toEqual(['https://data.zenbujapanese.com/*'])
    expect(manifest('release', 'staging').host_permissions).toEqual([
      'https://data.zenbujapanese.com/*'
    ])
    expect(manifest('test').host_permissions).toEqual(['http://language-data.localhost/*'])
    expect(release.content_security_policy.extension_pages).toBe(
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
    )
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

import { describe, expect, it } from 'vitest'
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

  it('needs a Chrome with the Translator API and asks only for the offscreen document and side panel', () => {
    const release = manifest('release')
    expect(Number(minimumChromeVersion)).toBeGreaterThanOrEqual(138)
    expect(release.minimum_chrome_version).toBe(minimumChromeVersion)
    expect(release.permissions).toEqual(['offscreen', 'sidePanel', 'storage'])
    expect(release.background).toEqual({ service_worker: 'service-worker.js', type: 'module' })
  })
})

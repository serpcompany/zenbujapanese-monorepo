import { describe, expect, it } from 'vitest'
import { manifest, minimumChromeVersion } from './manifest.ts'

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
    expect(test.web_accessible_resources?.[0]?.resources).toEqual(['assets/*.woff2'])
  })

  it('needs a Chrome with the Translator API and asks only for the offscreen document, the side panel, storage and YouTube', () => {
    const release = manifest('release')
    expect(Number(minimumChromeVersion)).toBeGreaterThanOrEqual(138)
    expect(release.minimum_chrome_version).toBe(minimumChromeVersion)
    expect(release.permissions).toEqual([
      'offscreen',
      'sidePanel',
      'storage',
      'declarativeNetRequestWithHostAccess'
    ])
    expect(release.host_permissions).toEqual(['https://www.youtube.com/*'])
    expect(release.background).toEqual({ service_worker: 'service-worker.js', type: 'module' })
  })
})

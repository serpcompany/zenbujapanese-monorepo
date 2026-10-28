import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type BrowserContext, test as base, expect, type Page, type Worker } from '@playwright/test'
import { contentScriptHost } from './expected.ts'
import { type LocalServer, startLocalServer } from './local-server.ts'
import { startYouTubeStandIn, type YouTubeStandIn } from './youtube-stand-in.ts'

export { expect }

const extensionBuild = join(import.meta.dirname, '..', 'dist-test')

export type Extension = {
  context: BrowserContext
  id: string
  origin: string
  dynamicOrigin: string
  serviceWorker: Worker
  server: LocalServer
  manifest: Record<string, unknown>
  youTube: YouTubeStandIn | null
}

const extensionSchemes = new Set(['chrome-extension:', 'chrome:', 'data:', 'blob:', 'about:'])

function isAllowedRequest(url: string, server: LocalServer, extension: Extension) {
  const { protocol, host, origin } = new URL(url)
  if (protocol === 'chrome-extension:') {
    return [extension.origin, extension.dynamicOrigin].includes(`${protocol}//${host}`)
  }
  return (
    extensionSchemes.has(protocol) ||
    [server.url, server.languageDataUrl, server.allowedSiteUrl, extension.youTube?.origin].includes(
      origin
    )
  )
}

function onlyTheLocalServer(server: LocalServer, youTube: YouTubeStandIn | null) {
  const rules = [server.hostRule, ...(youTube ? [youTube.hostRule] : [])].join(', ')
  return `--host-resolver-rules=${rules}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`
}

export const test = base.extend<
  { outsideRequests: string[] },
  { extension: Extension; languageDataHeld: boolean; youTubeStandIn: boolean }
>({
  languageDataHeld: [false, { option: true, scope: 'worker' }],
  youTubeStandIn: [false, { option: true, scope: 'worker' }],
  extension: [
    async ({ playwright, languageDataHeld, youTubeStandIn }, use) => {
      const server = await startLocalServer(0, languageDataHeld)
      const youTube = youTubeStandIn ? await startYouTubeStandIn() : null
      const profile = mkdtempSync(join(tmpdir(), 'zenbu-extension-'))
      const context = await playwright.chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        args: [
          `--disable-extensions-except=${extensionBuild}`,
          `--load-extension=${extensionBuild}`,
          '--disable-blink-features=WebShare',
          onlyTheLocalServer(server, youTube),
          ...(youTube ? [youTube.certificate] : [])
        ]
      })
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const id = new URL(serviceWorker.url()).host
      const origin = `chrome-extension://${id}`
      const dynamicId = await serviceWorker.evaluate(
        () => (chrome.runtime as typeof chrome.runtime & { dynamicId: string }).dynamicId
      )
      const dynamicOrigin = `chrome-extension://${dynamicId}`
      const manifest = JSON.parse(readFileSync(join(extensionBuild, 'manifest.json'), 'utf8'))
      await use({ context, id, origin, dynamicOrigin, serviceWorker, server, manifest, youTube })
      await context.close()
      await server.close()
      youTube?.close()
      rmSync(profile, { recursive: true, force: true })
    },
    { scope: 'worker' }
  ],
  outsideRequests: [
    async ({ extension }, use) => {
      const outside: string[] = []
      const record = (request: { url(): string }) => {
        if (!isAllowedRequest(request.url(), extension.server, extension)) {
          outside.push(request.url())
        }
      }
      extension.context.on('request', record)
      await use(outside)
      extension.context.off('request', record)
      expect(outside, 'requests to anything but the local server and the extension').toEqual([])
    },
    { auto: true }
  ],
  page: async ({ extension }, use) => {
    const page = await extension.context.newPage()
    const problems: string[] = []
    page.on('pageerror', error => problems.push(`${error.name}: ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') problems.push(`${message.text()} ${message.location().url}`)
    })
    await use(page)
    await page.close()
    expect(problems, 'errors the page logged').toEqual([])
  }
})

export const extensionUrl = (extension: Extension, path: string) => `${extension.origin}/${path}`

export async function closeOffscreenDocument(extension: Extension) {
  await extension.serviceWorker.evaluate(() => chrome.offscreen.closeDocument())
}

export function contentScriptSurface(page: Page) {
  return page.locator(contentScriptHost)
}

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type BrowserContext, test as base, expect, type Page, type Worker } from '@playwright/test'
import { contentScriptHost } from './expected.ts'
import { type LocalServer, startLocalServer } from './local-server.ts'

export { expect }

const extensionBuild = join(import.meta.dirname, '..', 'dist-test')

export type Extension = {
  context: BrowserContext
  id: string
  origin: string
  serviceWorker: Worker
  server: LocalServer
  manifest: Record<string, unknown>
}

const extensionSchemes = new Set(['chrome-extension:', 'data:', 'blob:', 'about:'])

function isAllowedRequest(url: string, server: LocalServer, extensionOrigin: string) {
  const { protocol, host, origin } = new URL(url)
  if (protocol === 'chrome-extension:') return `${protocol}//${host}` === extensionOrigin
  return (
    extensionSchemes.has(protocol) || origin === server.url || origin === server.languageDataUrl
  )
}

function onlyTheLocalServer(server: LocalServer) {
  return `--host-resolver-rules=${server.hostRule}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`
}

export const test = base.extend<{ outsideRequests: string[] }, { extension: Extension }>({
  extension: [
    async ({ playwright }, use) => {
      const server = await startLocalServer()
      const profile = mkdtempSync(join(tmpdir(), 'zenbu-extension-'))
      const context = await playwright.chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        args: [
          `--disable-extensions-except=${extensionBuild}`,
          `--load-extension=${extensionBuild}`,
          onlyTheLocalServer(server)
        ]
      })
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const id = new URL(serviceWorker.url()).host
      const origin = `chrome-extension://${id}`
      const manifest = JSON.parse(readFileSync(join(extensionBuild, 'manifest.json'), 'utf8'))
      await use({ context, id, origin, serviceWorker, server, manifest })
      await context.close()
      await server.close()
      rmSync(profile, { recursive: true, force: true })
    },
    { scope: 'worker' }
  ],
  outsideRequests: [
    async ({ extension }, use) => {
      const outside: string[] = []
      const record = (request: { url(): string }) => {
        if (!isAllowedRequest(request.url(), extension.server, extension.origin)) {
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

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type BrowserContext, test as base, expect, type Page, type Worker } from '@playwright/test'
import { type AccountService, startAccountService } from './account-service.ts'
import { contentScriptHost } from './expected.ts'
import { type LocalServer, startLocalServer } from './local-server.ts'
import { startYouTubeStandIn, type YouTubeStandIn } from './youtube-stand-in.ts'

export { expect }

const extensionBuild = join(import.meta.dirname, '..', 'dist-test')

export type Extension = {
  context: BrowserContext
  id: string
  origin: string
  serviceWorker: Worker
  server: LocalServer
  manifest: Record<string, unknown>
  youTube: YouTubeStandIn | null
  account: AccountService | null
}

const extensionSchemes = new Set(['chrome-extension:', 'chrome:', 'data:', 'blob:', 'about:'])

function isAllowedRequest(url: string, server: LocalServer, extension: Extension) {
  const { protocol, host, origin } = new URL(url)
  if (protocol === 'chrome-extension:') return `${protocol}//${host}` === extension.origin
  return (
    extensionSchemes.has(protocol) ||
    [
      server.url,
      server.languageDataUrl,
      server.allowedSiteUrl,
      extension.youTube?.origin,
      ...(extension.account?.origins ?? []),
      ...(extension.account ? [`https://${extension.id}.chromiumapp.org`] : [])
    ].includes(origin)
  )
}

function trusting(youTube: YouTubeStandIn | null, account: AccountService | null): string[] {
  const certificates = [youTube?.spki, account?.spki].filter(spki => spki !== undefined)
  return certificates.length === 0
    ? []
    : [`--ignore-certificate-errors-spki-list=${certificates.join(',')}`]
}

function onlyTheLocalServer(
  server: LocalServer,
  youTube: YouTubeStandIn | null,
  account: AccountService | null
) {
  const rules = [server.hostRule, youTube?.hostRule, ...(account?.hostRules ?? [])]
    .filter(rule => rule !== undefined)
    .join(', ')
  return `--host-resolver-rules=${rules}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`
}

export const test = base.extend<
  { outsideRequests: string[] },
  {
    extension: Extension
    languageDataHeld: boolean
    youTubeStandIn: boolean
    accountService: boolean
    reloads: boolean
  }
>({
  languageDataHeld: [false, { option: true, scope: 'worker' }],
  reloads: [false, { option: true, scope: 'worker' }],
  youTubeStandIn: [false, { option: true, scope: 'worker' }],
  accountService: [false, { option: true, scope: 'worker' }],
  extension: [
    async ({ playwright, languageDataHeld, youTubeStandIn, accountService }, use) => {
      const server = await startLocalServer(0, languageDataHeld)
      const youTube = youTubeStandIn ? await startYouTubeStandIn() : null
      const account = accountService ? await startAccountService() : null
      const profile = mkdtempSync(join(tmpdir(), 'zenbu-extension-'))
      const context = await playwright.chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        args: [
          `--disable-extensions-except=${extensionBuild}`,
          `--load-extension=${extensionBuild}`,
          '--disable-blink-features=WebShare',
          onlyTheLocalServer(server, youTube, account),
          ...trusting(youTube, account)
        ]
      })
      const serviceWorker =
        context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
      const id = new URL(serviceWorker.url()).host
      const origin = `chrome-extension://${id}`
      const manifest = JSON.parse(readFileSync(join(extensionBuild, 'manifest.json'), 'utf8'))
      await use({ context, id, origin, serviceWorker, server, manifest, youTube, account })
      await context.close()
      await server.close()
      youTube?.close()
      await account?.close()
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

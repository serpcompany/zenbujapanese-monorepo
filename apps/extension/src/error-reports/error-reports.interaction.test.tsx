import { close, isInitialized } from '@sentry/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { forwardedEvents } from '../test/forwarded-events'
import { recordingSettings } from '../test/recording-settings'
import { settingStorage } from '../test/setting-storage'
import {
  contentScriptErrorReports,
  receiveErrorReport,
  startErrorReports,
  startSendingErrorReports
} from './error-reports'
import type { ErrorReportMessage } from './forwarding'

function throwFromThePage(message: string) {
  const error = new Error(message)
  window.onerror?.(message, 'https://news.example.com/app.js', 1, 1, error)
  window.dispatchEvent(new window.ErrorEvent('error', { error, message }))
}

function overChromeMessaging(message: ErrorReportMessage) {
  receiveErrorReport(JSON.parse(JSON.stringify(message)))
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await close()
})

describe('a content script', () => {
  it("never catches the page's own errors, and installs no global handler", async () => {
    const { settings } = recordingSettings()
    const forwarded: ErrorReportMessage[] = []
    const reporter = contentScriptErrorReports(message => forwarded.push(message), settings)
    expect(window.onerror).toBeNull()
    expect(window.onunhandledrejection).toBeNull()
    throwFromThePage('An error in the page')
    reporter.report(new Error('The content script'))
    await vi.waitFor(() => expect(forwarded).toHaveLength(1))
    expect(forwardedEvents(forwarded).map(event => event.exception?.values?.[0]?.value)).toEqual([
      'The content script'
    ])
    expect(isInitialized()).toBe(false)
  })

  it('reports nothing from a build without a destination', () => {
    const forward = vi.fn()
    expect(() => contentScriptErrorReports(forward, {}).report(new Error('nowhere'))).not.toThrow()
    startErrorReports('page', forward, {})
    startSendingErrorReports(settingStorage().storage, {})
    expect(forward).not.toHaveBeenCalled()
    expect(isInitialized()).toBe(false)
  })

  it('hands its report to the service worker, which sends it, and makes no request itself', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { settings, sent } = recordingSettings()
    startSendingErrorReports(settingStorage().storage, settings)
    contentScriptErrorReports(overChromeMessaging, settings).report(
      new Error('No entry for 食べる on https://news.example.com/a')
    )
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]?.exception?.values?.[0]?.value).toBe('No entry for <japanese> on <url>')
    expect(sent[0]?.tags).toEqual({ part: 'content-script' })
    expect(sent[0]?.environment).toBe('qa')
    expect(sent[0]?.release).toBe('zenbujapanese-extension@0.1.0')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe("the extension's own pages", () => {
  it('hand an uncaught error to the service worker, scrubbed and tagged with their part', async () => {
    const { settings } = recordingSettings()
    const forwarded: ErrorReportMessage[] = []
    startErrorReports('page', message => forwarded.push(message), settings)
    throwFromThePage('Uncaught on https://news.example.com/a')
    await vi.waitFor(() => expect(forwarded).toHaveLength(1))
    const [event] = forwardedEvents(forwarded)
    expect(event?.exception?.values?.[0]?.value).toBe('Uncaught on <url>')
    expect(event?.tags).toEqual({ part: 'page' })
    expect(event?.breadcrumbs).toBeUndefined()
  })
})

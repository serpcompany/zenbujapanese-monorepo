import { isInitialized } from '@sentry/browser'
import { describe, expect, it, vi } from 'vitest'
import { recordingSettings } from '../test/recording-settings'
import { contentScriptErrorReports, startErrorReports } from './error-reports'

function throwFromThePage(message: string) {
  const error = new Error(message)
  window.onerror?.(message, 'https://news.example.com/app.js', 1, 1, error)
  window.dispatchEvent(new window.ErrorEvent('error', { error, message }))
}

describe('a content script', () => {
  it('reports its own error, scrubbed and tagged as the content script', async () => {
    const { settings, sent } = recordingSettings()
    contentScriptErrorReports(settings).report(
      new Error('No entry for 食べる on https://news.example.com/a')
    )
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]?.exception?.values?.[0]?.value).toBe('No entry for <japanese> on <url>')
    expect(sent[0]?.tags).toEqual({ part: 'content-script' })
    expect(sent[0]?.environment).toBe('qa')
    expect(sent[0]?.release).toBe('zenbujapanese-extension@0.1.0')
  })

  it("never catches the page's own errors, and installs no global handler", async () => {
    const { settings, sent } = recordingSettings()
    const reporter = contentScriptErrorReports(settings)
    expect(window.onerror).toBeNull()
    expect(window.onunhandledrejection).toBeNull()
    throwFromThePage('An error in the page')
    reporter.report(new Error('The content script'))
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent.map(event => event.exception?.values?.[0]?.value)).toEqual(['The content script'])
    expect(isInitialized()).toBe(false)
  })

  it('reports nothing from a build without a destination', () => {
    expect(() => contentScriptErrorReports({}).report(new Error('nowhere'))).not.toThrow()
    startErrorReports('page', {})
    expect(isInitialized()).toBe(false)
  })
})

describe("the extension's own pages and workers", () => {
  it('report an uncaught error, scrubbed and tagged with their part', async () => {
    const { settings, sent } = recordingSettings()
    startErrorReports('page', settings)
    throwFromThePage('Uncaught on https://news.example.com/a')
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]?.exception?.values?.[0]?.value).toBe('Uncaught on <url>')
    expect(sent[0]?.tags).toEqual({ part: 'page' })
    expect(sent[0]?.breadcrumbs).toBeUndefined()
  })
})

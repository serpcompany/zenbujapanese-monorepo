import { describe, expect, it, vi } from 'vitest'
import { forwardedEvents } from '../test/forwarded-events'
import { recordingSettings } from '../test/recording-settings'
import { startErrorReports } from './error-reports'
import type { ErrorReportMessage } from './forwarding'

describe('a worker, with no window or document', () => {
  it('hands an uncaught error, tagged with its part, to the service worker', async () => {
    expect(typeof window).toBe('undefined')
    const { settings } = recordingSettings()
    const forwarded: ErrorReportMessage[] = []
    startErrorReports('worker', message => forwarded.push(message), settings)
    const error = new Error('Uncaught in the dictionary worker')
    globalThis.onerror?.(error.message, 'chrome-extension://abc/assets/worker.js', 1, 1, error)
    await vi.waitFor(() => expect(forwarded).toHaveLength(1))
    const [event] = forwardedEvents(forwarded)
    expect(event?.exception?.values?.[0]?.value).toBe('Uncaught in the dictionary worker')
    expect(event?.tags).toEqual({ part: 'worker' })
    expect(forwarded[0]?.target).toBe('service-worker')
  })
})

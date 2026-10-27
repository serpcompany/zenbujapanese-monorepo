import { describe, expect, it, vi } from 'vitest'
import { recordingSettings } from '../test/recording-settings'
import { startErrorReports } from './error-reports'

describe('a worker, with no window or document', () => {
  it('reports an uncaught error, tagged with its part', async () => {
    expect(typeof window).toBe('undefined')
    const { settings, sent } = recordingSettings()
    startErrorReports('worker', settings)
    const error = new Error('Uncaught in the dictionary worker')
    globalThis.onerror?.(error.message, 'chrome-extension://abc/assets/worker.js', 1, 1, error)
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]?.exception?.values?.[0]?.value).toBe('Uncaught in the dictionary worker')
    expect(sent[0]?.tags).toEqual({ part: 'worker' })
  })
})

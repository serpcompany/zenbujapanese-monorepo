import { afterEach, describe, expect, it, vi } from 'vitest'
import { startExtension } from '../test/extension'
import { syncWhenOpened } from './sync-when-opened'

let stop: (() => void) | undefined

afterEach(() => {
  stop?.()
  stop = undefined
})

function shownAs(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('the side panel opening', () => {
  it('tells the service worker it opened, and again each time it is shown, never when hidden', async () => {
    startExtension()
    const sent = vi.spyOn(chrome.runtime, 'sendMessage')
    stop = syncWhenOpened()
    shownAs('hidden')
    shownAs('visible')
    const opened = { target: 'service-worker', copy: { copy: 'opened' } }
    await vi.waitFor(() =>
      expect(sent.mock.calls.map(([message]) => message)).toEqual([opened, opened])
    )
    stop()
    stop = undefined
    shownAs('visible')
    await Promise.resolve()
    await Promise.resolve()
    expect(sent).toHaveBeenCalledTimes(2)
  })
})

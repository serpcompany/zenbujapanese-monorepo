import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountKey, askAccount, onAccountChanged } from './account'

type Listener = (changes: Record<string, unknown>) => void

function changeEvents() {
  const listeners = new Set<Listener>()
  return {
    listeners,
    addListener: (listener: Listener) => void listeners.add(listener),
    removeListener: (listener: Listener) => void listeners.delete(listener),
    fire: (changes: Record<string, unknown>) => {
      for (const listener of listeners) listener(changes)
    }
  }
}

describe('asking the service worker about the account', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the request to the service worker and takes its answer', async () => {
    const sendMessage = vi.fn(async () => ({ type: 'account', account: { signedIn: false } }))
    await expect(askAccount({ account: 'read' }, { sendMessage })).resolves.toEqual({
      type: 'account',
      account: { signedIn: false }
    })
    expect(sendMessage).toHaveBeenCalledWith({
      target: 'service-worker',
      account: { account: 'read' }
    })
  })

  it('answers failed when the service worker answers without a type, or no extension runtime is there', async () => {
    const empty = await askAccount({ account: 'read' }, { sendMessage: async () => undefined })
    vi.stubGlobal('chrome', undefined)
    const outside = await askAccount({ account: 'read' })
    expect([empty.type, outside.type]).toEqual(['failed', 'failed'])
  })

  it('hears a change to the kept account and not to other keys, and stops when asked', () => {
    const events = changeEvents()
    const heard = vi.fn()
    const stop = onAccountChanged(heard, events)
    events.fire({ 'settings.theme': {} })
    events.fire({ [accountKey]: {} })
    stop()
    events.fire({ [accountKey]: {} })
    expect([heard.mock.calls.length, events.listeners.size]).toEqual([1, 0])
  })

  it('listens to nothing when no extension runtime is there', () => {
    vi.stubGlobal('chrome', undefined)
    const stop = onAccountChanged(vi.fn())
    expect(stop).not.toThrow()
  })
})

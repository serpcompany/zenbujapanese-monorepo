import { describe, expect, it, vi } from 'vitest'
import { askWorker, relayToWorker } from '../offscreen/relay'
import { askDictionary, type DictionaryRequest, type Envelope } from '../shared/messages'
import { answer } from '../worker/answer'
import { routeToOffscreen } from './router'

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (answer: unknown) => void
) => boolean

class FakeWorker extends EventTarget {
  postMessage(request: DictionaryRequest, [port]: Transferable[]) {
    ;(port as MessagePort).postMessage(answer(request))
  }
}

class CrashingWorker extends EventTarget {
  postMessage() {
    this.dispatchEvent(new Event('error'))
  }
}

function fakeRuntime(listeners: Listener[]) {
  return {
    sendMessage: (message: Envelope) =>
      new Promise<never>((resolve, reject) => {
        const handled = listeners.some(listener => listener(message, {}, resolve as never))
        if (!handled)
          reject(new Error('Could not establish connection. Receiving end does not exist.'))
      })
  }
}

describe('a page asks the dictionary worker', () => {
  it('reaches the worker through the service worker and the offscreen document', async () => {
    const offscreenListeners: Listener[] = []
    const ensureOffscreenDocument = vi.fn(async () => {
      offscreenListeners.splice(0, 1, relayToWorker(askWorker(new FakeWorker())) as Listener)
    })
    const serviceWorker = routeToOffscreen({
      ensureOffscreenDocument,
      sendMessage: fakeRuntime(offscreenListeners).sendMessage
    })
    const runtime = fakeRuntime([serviceWorker as Listener])

    await expect(askDictionary({ type: 'ping' }, runtime)).resolves.toEqual({
      type: 'pong',
      from: 'dictionary-worker'
    })
    expect(ensureOffscreenDocument).toHaveBeenCalledOnce()
  })

  it('answers with a failure when the offscreen document cannot open', async () => {
    const serviceWorker = routeToOffscreen({
      ensureOffscreenDocument: () => Promise.reject(new Error('Only a single offscreen document')),
      sendMessage: vi.fn()
    })
    await expect(
      askDictionary({ type: 'ping' }, fakeRuntime([serviceWorker as Listener]))
    ).resolves.toEqual({ type: 'failed', reason: 'Only a single offscreen document' })
  })

  it('answers with a failure when the dictionary worker fails', async () => {
    const worker = new CrashingWorker()
    const removeEventListener = vi.spyOn(worker, 'removeEventListener')
    const offscreen = relayToWorker(askWorker(worker))
    const serviceWorker = routeToOffscreen({
      ensureOffscreenDocument: async () => {},
      sendMessage: fakeRuntime([offscreen as Listener]).sendMessage
    })
    await expect(
      askDictionary({ type: 'ping' }, fakeRuntime([serviceWorker as Listener]))
    ).resolves.toEqual({ type: 'failed', reason: 'The dictionary worker failed.' })
    expect(removeEventListener).toHaveBeenCalledWith('error', expect.any(Function))
  })

  it('answers with a failure when nothing receives the message', async () => {
    await expect(askDictionary({ type: 'ping' }, fakeRuntime([]))).resolves.toEqual({
      type: 'failed',
      reason: 'Could not establish connection. Receiving end does not exist.'
    })
  })

  it('leaves messages meant for another part alone', () => {
    const sendResponse = vi.fn()
    const serviceWorker = routeToOffscreen({
      ensureOffscreenDocument: vi.fn(),
      sendMessage: vi.fn()
    })
    const offscreen = relayToWorker(vi.fn())
    expect(
      serviceWorker({ target: 'offscreen', request: { type: 'ping' } }, {}, sendResponse)
    ).toBe(false)
    expect(
      offscreen({ target: 'service-worker', request: { type: 'ping' } }, {}, sendResponse)
    ).toBe(false)
    expect(offscreen('ping', {}, sendResponse)).toBe(false)
    expect(sendResponse).not.toHaveBeenCalled()
  })
})

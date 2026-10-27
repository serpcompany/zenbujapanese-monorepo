import { describe, expect, it, vi } from 'vitest'
import { announceStarted, askWorker, relayToWorker } from '../offscreen/relay'
import { askDictionary, type DictionaryRequest } from '../shared/messages'
import { answer } from '../worker/answer'
import { offscreenDocumentKeeper } from './offscreen-document'
import { routeToOffscreen } from './router'

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (answer: unknown) => void
) => boolean

const pong = { type: 'pong', from: 'dictionary-worker' }

class FakeWorker extends EventTarget {
  constructor() {
    super()
    setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: 'started' })))
  }

  terminate() {}

  postMessage(request: DictionaryRequest, [port]: Transferable[]) {
    ;(port as MessagePort).postMessage(answer(request))
  }
}

class CrashingWorker extends FakeWorker {
  override postMessage() {
    this.dispatchEvent(new Event('error'))
  }
}

function fakeRuntime(listeners: Listener[]) {
  return {
    sendMessage: (message: unknown) =>
      new Promise<never>((resolve, reject) => {
        const handled = listeners.some(listener => listener(message, {}, resolve as never))
        if (!handled)
          reject(new Error('Could not establish connection. Receiving end does not exist.'))
      })
  }
}

function fakeChrome() {
  const serviceWorker: Listener[] = []
  const offscreen: Listener[] = []
  const toOffscreen = fakeRuntime(offscreen)
  const toServiceWorker = fakeRuntime(serviceWorker)
  let open = false
  const keeper = offscreenDocumentKeeper({
    getURL: path => path,
    getContexts: async () => (open ? [{}] : []),
    createDocument: async () => {
      open = true
      setTimeout(() => {
        offscreen.push(relayToWorker(askWorker(() => new FakeWorker())) as Listener)
        announceStarted(toServiceWorker)
      })
    }
  })
  serviceWorker.push(
    routeToOffscreen({
      ensureOffscreenDocument: keeper.ensureOpen,
      offscreenDocumentStarted: keeper.documentStarted,
      sendMessage: toOffscreen.sendMessage
    }) as Listener
  )
  return {
    page: toServiceWorker,
    closeOffscreenDocument: () => {
      open = false
      offscreen.length = 0
    }
  }
}

function serviceWorkerOver(offscreen: Listener) {
  return routeToOffscreen({
    ensureOffscreenDocument: async () => {},
    offscreenDocumentStarted: vi.fn(),
    sendMessage: fakeRuntime([offscreen]).sendMessage
  }) as Listener
}

describe('a page asks the dictionary worker', () => {
  it('reaches the worker through the service worker and the offscreen document', async () => {
    const { page } = fakeChrome()
    await expect(askDictionary({ type: 'ping' }, page)).resolves.toEqual(pong)
  })

  it('reaches it on the first ask after the offscreen document closed, once the new one has started', async () => {
    const { page, closeOffscreenDocument } = fakeChrome()
    await expect(askDictionary({ type: 'ping' }, page)).resolves.toEqual(pong)
    closeOffscreenDocument()
    await expect(askDictionary({ type: 'ping' }, page)).resolves.toEqual(pong)
  })

  it('answers with a failure when the offscreen document cannot open', async () => {
    const serviceWorker = routeToOffscreen({
      ensureOffscreenDocument: () => Promise.reject(new Error('Only a single offscreen document')),
      offscreenDocumentStarted: vi.fn(),
      sendMessage: vi.fn()
    })
    await expect(
      askDictionary({ type: 'ping' }, fakeRuntime([serviceWorker as Listener]))
    ).resolves.toEqual({ type: 'failed', reason: 'Only a single offscreen document' })
  })

  it('answers with a failure when the dictionary worker fails', async () => {
    const offscreen = relayToWorker(askWorker(() => new CrashingWorker())) as Listener
    const runtime = fakeRuntime([serviceWorkerOver(offscreen)])
    const failed = { type: 'failed', reason: 'The dictionary worker failed.' }
    await expect(askDictionary({ type: 'ping' }, runtime)).resolves.toEqual(failed)
    await expect(askDictionary({ type: 'ping' }, runtime)).resolves.toEqual(failed)
  })

  it('answers with a failure when nothing receives the message', async () => {
    await expect(askDictionary({ type: 'ping' }, fakeRuntime([]))).resolves.toEqual({
      type: 'failed',
      reason: 'Could not establish connection. Receiving end does not exist.'
    })
  })

  it('answers with a failure when sending throws, as it does once the extension reloads', async () => {
    const runtime = {
      sendMessage: () => {
        throw new Error('Extension context invalidated.')
      }
    }
    await expect(askDictionary({ type: 'ping' }, runtime)).resolves.toEqual({
      type: 'failed',
      reason: 'Extension context invalidated.'
    })
  })

  it('answers a request the worker does not know with a failure', () => {
    expect(answer({ type: 'lookup' } as unknown as DictionaryRequest)).toEqual({
      type: 'failed',
      reason: 'The dictionary worker does not know this request.'
    })
  })

  it('leaves messages meant for another part, or without a request, alone', () => {
    const sendResponse = vi.fn()
    const serviceWorker = serviceWorkerOver(vi.fn())
    const offscreen = relayToWorker(vi.fn())
    const ping = { type: 'ping' }
    expect(serviceWorker({ target: 'offscreen', request: ping }, {}, sendResponse)).toBe(false)
    expect(serviceWorker({ target: 'service-worker', request: {} }, {}, sendResponse)).toBe(false)
    expect(offscreen({ target: 'service-worker', request: ping }, {}, sendResponse)).toBe(false)
    expect(offscreen('ping', {}, sendResponse)).toBe(false)
    expect(sendResponse).not.toHaveBeenCalled()
  })
})

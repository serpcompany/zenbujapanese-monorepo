import { describe, expect, it, vi } from 'vitest'
import type { DictionaryRequest } from '../shared/messages'
import { answer } from '../worker/answer'
import { askWorker, type DictionaryWorker } from './relay'

const ping: DictionaryRequest = { type: 'ping' }
const pong = { type: 'pong', from: 'dictionary-worker' }

class FakeWorker extends EventTarget implements DictionaryWorker {
  terminate = vi.fn()

  start() {
    this.dispatchEvent(new MessageEvent('message', { data: 'started' }))
  }

  postMessage(request: DictionaryRequest, [port]: Transferable[]) {
    ;(port as MessagePort).postMessage(answer(request))
  }
}

class WorkerThatAnswersOnceStarted extends FakeWorker {
  private started = false

  override start() {
    this.started = true
    super.start()
  }

  override postMessage(request: DictionaryRequest, transfer: Transferable[]) {
    if (this.started) super.postMessage(request, transfer)
  }
}

class WorkerThatFailsToStart extends FakeWorker {
  constructor() {
    super()
    setTimeout(() => this.dispatchEvent(new Event('error')))
  }

  override postMessage() {}
}

class SilentWorker extends FakeWorker {
  override postMessage() {}
}

describe('askWorker', () => {
  it('posts a request once the worker has started, so none is lost while it loads', async () => {
    const worker = new WorkerThatAnswersOnceStarted()
    const asked = askWorker(() => worker)(ping)
    setTimeout(() => worker.start())
    await expect(asked).resolves.toEqual(pong)
  })

  it('fails every request, not only the first, when the worker cannot start', async () => {
    const startWorker = vi.fn(() => new WorkerThatFailsToStart())
    const ask = askWorker(startWorker)
    await expect(ask(ping)).rejects.toThrow('The dictionary worker failed.')
    await expect(ask(ping)).rejects.toThrow('The dictionary worker failed.')
    expect(startWorker).toHaveBeenCalledTimes(2)
    expect(startWorker.mock.results[0]?.value.terminate).toHaveBeenCalled()
  })

  it('starts a new worker after one fails, and the new one answers', async () => {
    const working = new FakeWorker()
    const startWorker = vi
      .fn<() => DictionaryWorker>()
      .mockReturnValueOnce(new WorkerThatFailsToStart())
      .mockReturnValueOnce(working)
    const ask = askWorker(startWorker)
    await expect(ask(ping)).rejects.toThrow('The dictionary worker failed.')
    const asked = ask(ping)
    working.start()
    await expect(asked).resolves.toEqual(pong)
  })

  it('ends a worker that never starts, so the next request starts a fresh one', async () => {
    const stuck = new FakeWorker()
    const working = new FakeWorker()
    const startWorker = vi
      .fn<() => DictionaryWorker>()
      .mockReturnValueOnce(stuck)
      .mockReturnValueOnce(working)
    const ask = askWorker(startWorker, 10)
    await expect(ask(ping)).rejects.toThrow('The dictionary worker did not answer.')
    expect(stuck.terminate).toHaveBeenCalled()
    const asked = ask(ping)
    working.start()
    await expect(asked).resolves.toEqual(pong)
    expect(startWorker).toHaveBeenCalledTimes(2)
  })

  it('fails a request the worker never answers', async () => {
    const worker = new SilentWorker()
    const asked = askWorker(() => worker, 10)(ping)
    worker.start()
    await expect(asked).rejects.toThrow('The dictionary worker did not answer.')
  })
})

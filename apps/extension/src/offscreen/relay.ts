import {
  type DictionaryAnswer,
  type DictionaryRequest,
  type Failure,
  failure,
  isEnvelopeFor,
  offscreenStarted
} from '../shared/messages'

export type DictionaryWorker = {
  postMessage(message: unknown, transfer: Transferable[]): void
  addEventListener(type: 'message' | 'error', listener: (event: Event) => void): void
  terminate(): void
}

type Answer = DictionaryAnswer | Failure

type Running = {
  worker: DictionaryWorker
  started: Promise<void>
  hasStarted: boolean
  waiting: Set<(error: Error) => void>
}

const workerAnswerTimeoutMs = 10_000

function workerError(event: Event): Error {
  const { message } = event as Partial<ErrorEvent>
  return new Error(message || 'The dictionary worker failed.')
}

export function askWorker(
  startWorker: () => DictionaryWorker,
  timeoutMs = workerAnswerTimeoutMs
): (request: DictionaryRequest) => Promise<Answer> {
  let running: Running | undefined

  function end(run: Running, error: Error) {
    if (running === run) running = undefined
    run.worker.terminate()
    for (const fail of run.waiting) fail(error)
  }

  function start(): Running {
    const worker = startWorker()
    const run: Running = {
      worker,
      started: new Promise<void>(resolve => {
        worker.addEventListener('message', () => {
          run.hasStarted = true
          resolve()
        })
      }),
      hasStarted: false,
      waiting: new Set()
    }
    worker.addEventListener('error', event => end(run, workerError(event)))
    return run
  }

  return request => {
    running ??= start()
    const run = running
    const { worker, started, waiting } = run
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel()
      const timer = setTimeout(() => {
        const error = new Error('The dictionary worker did not answer.')
        if (run.hasStarted) fail(error)
        else end(run, error)
      }, timeoutMs)
      function settle() {
        clearTimeout(timer)
        waiting.delete(fail)
        channel.port1.close()
      }
      function fail(error: Error) {
        settle()
        reject(error)
      }
      channel.port1.onmessage = event => {
        settle()
        resolve(event.data as Answer)
      }
      waiting.add(fail)
      started.then(() => worker.postMessage(request, [channel.port2]))
    })
  }
}

export function relayToWorker(ask: (request: DictionaryRequest) => Promise<Answer>) {
  return (message: unknown, _sender: unknown, sendResponse: (answer: Answer) => void): boolean => {
    if (!isEnvelopeFor('offscreen', message)) return false
    ask(message.request).then(sendResponse, (error: unknown) => sendResponse(failure(error)))
    return true
  }
}

export function announceStarted(sender: { sendMessage(message: unknown): Promise<unknown> }) {
  return Promise.resolve()
    .then(() => sender.sendMessage(offscreenStarted))
    .catch(() => undefined)
}

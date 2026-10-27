import {
  type DictionaryAnswer,
  type DictionaryRequest,
  type Failure,
  failure,
  isEnvelopeFor
} from '../shared/messages'

type WorkerPort = {
  postMessage(message: unknown, transfer: Transferable[]): void
  addEventListener(type: 'error', listener: (event: Event) => void): void
  removeEventListener(type: 'error', listener: (event: Event) => void): void
}

function workerError(event: Event): Error {
  const { message } = event as Partial<ErrorEvent>
  return new Error(message || 'The dictionary worker failed.')
}

export function askWorker(worker: WorkerPort) {
  return (request: DictionaryRequest): Promise<DictionaryAnswer> =>
    new Promise((resolve, reject) => {
      const channel = new MessageChannel()
      const settle = () => {
        channel.port1.close()
        worker.removeEventListener('error', fail)
      }
      function fail(event: Event) {
        settle()
        reject(workerError(event))
      }
      channel.port1.onmessage = event => {
        settle()
        resolve(event.data as DictionaryAnswer)
      }
      worker.addEventListener('error', fail)
      worker.postMessage(request, [channel.port2])
    })
}

export function relayToWorker(ask: (request: DictionaryRequest) => Promise<DictionaryAnswer>) {
  return (
    message: unknown,
    _sender: unknown,
    sendResponse: (answer: DictionaryAnswer | Failure) => void
  ): boolean => {
    if (!isEnvelopeFor('offscreen', message)) return false
    ask(message.request).then(sendResponse, (error: unknown) => sendResponse(failure(error)))
    return true
  }
}

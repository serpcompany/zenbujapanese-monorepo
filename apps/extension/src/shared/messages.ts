export type DictionaryRequest = { type: 'ping' }

export type DictionaryAnswer = { type: 'pong'; from: 'dictionary-worker' }

export type Failure = { type: 'failed'; reason: string }

export type Target = 'service-worker' | 'offscreen'

export type Envelope = { target: Target; request: DictionaryRequest }

type Sender = { sendMessage(message: Envelope): Promise<DictionaryAnswer | Failure> }

export function isEnvelopeFor(target: Target, message: unknown): message is Envelope {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Partial<Envelope>).target === target &&
    typeof (message as Partial<Envelope>).request === 'object'
  )
}

export function askDictionary(
  request: DictionaryRequest,
  sender: Sender = chrome.runtime
): Promise<DictionaryAnswer | Failure> {
  return sender
    .sendMessage({ target: 'service-worker', request })
    .catch((error: unknown) => failure(error))
}

export function failure(error: unknown): Failure {
  return { type: 'failed', reason: error instanceof Error ? error.message : String(error) }
}

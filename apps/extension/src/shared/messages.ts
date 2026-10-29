import type {
  FormExamplesAnswer,
  KanjiAnswer,
  NotReady,
  PopupAnswer,
  ResolveAnswer,
  SegmentAnswer,
  StateAnswer,
  WordAnswer,
  WordExamplesAnswer
} from './answers'

export type DictionaryRequest =
  | { type: 'ping' }
  | { type: 'state' }
  | { type: 'update' }
  | { type: 'segment'; text: string }
  | { type: 'popup'; languageReferenceID: string; frequency: readonly string[] }
  | { type: 'word'; entSeq: number }
  | { type: 'kanji'; character: string }
  | { type: 'word-examples'; entSeq: number; from: number }
  | { type: 'form-examples'; form: string; from: number }
  | { type: 'resolve'; headword: string; reading: string }

export type DictionaryAnswer =
  | { type: 'pong'; from: 'dictionary-worker' }
  | StateAnswer
  | NotReady
  | SegmentAnswer
  | PopupAnswer
  | WordAnswer
  | KanjiAnswer
  | WordExamplesAnswer
  | FormExamplesAnswer
  | ResolveAnswer

export type Failure = { type: 'failed'; reason: string }

type Fields = Partial<Record<string, unknown>>

export const fields = (value: unknown): Fields | undefined =>
  typeof value === 'object' && value !== null ? (value as Fields) : undefined

export type Target = 'service-worker' | 'offscreen'

export type Envelope = { target: Target; request: DictionaryRequest }

export type OffscreenStarted = { target: 'service-worker'; started: 'offscreen' }

export const offscreenStarted: OffscreenStarted = { target: 'service-worker', started: 'offscreen' }

type Sender = { sendMessage(message: Envelope): Promise<DictionaryAnswer | Failure> }

export function isEnvelopeFor(target: Target, message: unknown): message is Envelope {
  if (typeof message !== 'object' || message === null) return false
  const { target: to, request } = message as Partial<Envelope>
  return (
    to === target &&
    typeof request === 'object' &&
    request !== null &&
    typeof (request as Partial<DictionaryRequest>).type === 'string'
  )
}

export function isOffscreenStarted(message: unknown): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Partial<OffscreenStarted>).target === offscreenStarted.target &&
    (message as Partial<OffscreenStarted>).started === offscreenStarted.started
  )
}

export function askDictionary(
  request: DictionaryRequest,
  sender: Sender = chrome.runtime
): Promise<DictionaryAnswer | Failure> {
  return Promise.resolve()
    .then(() => sender.sendMessage({ target: 'service-worker', request }))
    .catch((error: unknown) => failure(error))
}

export function failure(error: unknown): Failure {
  return { type: 'failed', reason: error instanceof Error ? error.message : String(error) }
}

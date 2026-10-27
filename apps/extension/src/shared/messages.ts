import type { PopupCard } from '@zenbu/dictionary-core/cards/popup-card'
import type { SegmentedToken } from '@zenbu/dictionary-core/cards/segmentation'
import type { KanjiRows, WordRows } from '@zenbu/dictionary-core/detail/rows'
import type { DataState } from './data-state'

export type DictionaryRequest =
  | { type: 'ping' }
  | { type: 'state' }
  | { type: 'update' }
  | { type: 'segment'; text: string }
  | { type: 'popup'; languageReferenceID: string; frequency: readonly string[] }
  | { type: 'word'; entSeq: number }
  | { type: 'kanji'; character: string }

export type DictionaryAnswer =
  | { type: 'pong'; from: 'dictionary-worker' }
  | { type: 'state'; data: DataState }
  | { type: 'not-ready'; data: DataState }
  | { type: 'segment'; tokens: SegmentedToken[]; romaji: string | null }
  | { type: 'popup'; card: PopupCard | null }
  | { type: 'word'; rows: WordRows | null }
  | { type: 'kanji'; rows: KanjiRows | null }

export type Failure = { type: 'failed'; reason: string }

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

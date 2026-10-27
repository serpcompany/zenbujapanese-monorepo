import { type Failure, failure } from '../shared/messages'

export type Language = 'ja' | 'en'

export type Direction = { from: Language; to: Language }

export type TranslatorState = 'unavailable' | 'downloadable' | 'downloading' | 'available'

export type TranslationRequest =
  | { type: 'availability'; direction: Direction }
  | { type: 'translate'; direction: Direction; texts: string[] }

export type TranslationAnswer =
  | { type: 'availability'; state: TranslatorState }
  | { type: 'translated'; texts: string[] }
  | { type: 'not-available'; state: Exclude<TranslatorState, 'available'> }

export type TranslationTarget = 'service-worker' | 'offscreen'

export type TranslationEnvelope = { target: TranslationTarget; translation: TranslationRequest }

export type TranslationSender = {
  sendMessage(message: TranslationEnvelope): Promise<TranslationAnswer | Failure>
}

export function isTranslationFor(
  target: TranslationTarget,
  message: unknown
): message is TranslationEnvelope {
  if (typeof message !== 'object' || message === null) return false
  const { target: to, translation } = message as Partial<TranslationEnvelope>
  return (
    to === target &&
    typeof translation === 'object' &&
    translation !== null &&
    typeof (translation as Partial<TranslationRequest>).type === 'string'
  )
}

export function translate(
  request: TranslationRequest,
  sender: TranslationSender = chrome.runtime
): Promise<TranslationAnswer | Failure> {
  return Promise.resolve()
    .then(() => sender.sendMessage({ target: 'service-worker', translation: request }))
    .catch((error: unknown) => failure(error))
}

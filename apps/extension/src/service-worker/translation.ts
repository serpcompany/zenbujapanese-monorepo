import { type Failure, failure } from '../shared/messages'
import {
  isTranslationFor,
  type TranslationAnswer,
  type TranslationSender
} from '../translation/messages'
import type { OffscreenDocumentKeeper } from './offscreen-document'

export function routeTranslation(
  offscreenDocument: Pick<OffscreenDocumentKeeper, 'ensureOpen'>,
  runtime: TranslationSender
) {
  return (
    message: unknown,
    _sender: unknown,
    sendResponse: (answer: TranslationAnswer | Failure) => void
  ): boolean => {
    if (!isTranslationFor('service-worker', message)) return false
    const { translation } = message
    offscreenDocument
      .ensureOpen()
      .then(() => runtime.sendMessage({ target: 'offscreen', translation }))
      .then(sendResponse, (error: unknown) => sendResponse(failure(error)))
    return true
  }
}

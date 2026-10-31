import type { Failure } from '../shared/messages'
import {
  isTranslationFor,
  type TranslationAnswer,
  type TranslationSender
} from '../translation/messages'
import type { OffscreenDocumentKeeper } from './offscreen-document'
import { type FailureCode, relayReportingFailures } from './router'

export function routeTranslation(
  offscreenDocument: Pick<OffscreenDocumentKeeper, 'ensureOpen'>,
  runtime: TranslationSender,
  reportFailure: (code: FailureCode) => void
) {
  return (
    message: unknown,
    _sender: unknown,
    sendResponse: (answer: TranslationAnswer | Failure) => void
  ): boolean => {
    if (!isTranslationFor('service-worker', message)) return false
    const { translation } = message
    relayReportingFailures({
      open: () => offscreenDocument.ensureOpen(),
      send: () => runtime.sendMessage({ target: 'offscreen', translation }),
      answerCode: 'translation-answer',
      reportFailure,
      sendResponse
    })
    return true
  }
}

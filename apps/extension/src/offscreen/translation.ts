import { type Failure, failure } from '../shared/messages'
import {
  isTranslationFor,
  type TranslationAnswer,
  type TranslationRequest
} from '../translation/messages'

type Translate = (request: TranslationRequest) => Promise<TranslationAnswer>

export function answerTranslation(translate: Translate) {
  return (
    message: unknown,
    _sender: unknown,
    sendResponse: (answer: TranslationAnswer | Failure) => void
  ): boolean => {
    if (!isTranslationFor('offscreen', message)) return false
    Promise.resolve()
      .then(() => translate(message.translation))
      .then(sendResponse, (error: unknown) => sendResponse(failure(error)))
    return true
  }
}

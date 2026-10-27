import { type Failure, failure } from '../shared/messages'
import {
  isTranslationFor,
  type TranslationAnswer,
  type TranslationRequest
} from '../translation/messages'

const translationTimeoutMs = 30_000

type Translate = (request: TranslationRequest) => Promise<TranslationAnswer>

function withinTime<T>(answer: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('The translator did not answer.')), timeoutMs)
  })
  return Promise.race([answer, late]).finally(() => clearTimeout(timer))
}

export function answerTranslation(translate: Translate, timeoutMs = translationTimeoutMs) {
  return (
    message: unknown,
    _sender: unknown,
    sendResponse: (answer: TranslationAnswer | Failure) => void
  ): boolean => {
    if (!isTranslationFor('offscreen', message)) return false
    withinTime(
      Promise.resolve().then(() => translate(message.translation)),
      timeoutMs
    ).then(sendResponse, (error: unknown) => sendResponse(failure(error)))
    return true
  }
}

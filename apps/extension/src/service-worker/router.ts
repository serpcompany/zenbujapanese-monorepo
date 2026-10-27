import {
  type DictionaryAnswer,
  type Envelope,
  type Failure,
  failure,
  isEnvelopeFor,
  isOffscreenStarted
} from '../shared/messages'

type FailureCode = 'offscreen-document' | 'offscreen-message' | 'dictionary-answer'

type Relay = {
  ensureOffscreenDocument(): Promise<void>
  offscreenDocumentStarted(): void
  sendMessage(message: Envelope): Promise<DictionaryAnswer | Failure>
  reportFailure(code: FailureCode): void
}

class StepFailed extends Error {
  constructor(
    readonly code: FailureCode,
    readonly error: unknown
  ) {
    super()
  }
}

function step<T>(code: FailureCode, run: () => Promise<T>): Promise<T> {
  return Promise.resolve()
    .then(run)
    .catch((error: unknown) => Promise.reject(new StepFailed(code, error)))
}

export function routeToOffscreen(relay: Relay) {
  return (
    message: unknown,
    _sender: unknown,
    sendResponse: (answer: DictionaryAnswer | Failure) => void
  ): boolean => {
    if (isOffscreenStarted(message)) relay.offscreenDocumentStarted()
    if (!isEnvelopeFor('service-worker', message)) return false
    const { request } = message
    step('offscreen-document', () => relay.ensureOffscreenDocument())
      .then(() =>
        step('offscreen-message', () => relay.sendMessage({ target: 'offscreen', request }))
      )
      .then(
        answer => {
          if (answer.type === 'failed') relay.reportFailure('dictionary-answer')
          sendResponse(answer)
        },
        (failed: StepFailed) => {
          relay.reportFailure(failed.code)
          sendResponse(failure(failed.error))
        }
      )
    return true
  }
}

import {
  type DictionaryAnswer,
  type Envelope,
  type Failure,
  failure,
  isEnvelopeFor,
  isOffscreenStarted
} from '../shared/messages'

export type FailureCode =
  | 'offscreen-document'
  | 'offscreen-message'
  | 'dictionary-answer'
  | 'translation-answer'
  | 'side-panel-behavior'
  | 'page-script'

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

type Answered = { type: string }

type Relayed<A extends Answered> = {
  open(): Promise<void>
  send(): Promise<A | Failure>
  answerCode: FailureCode
  reportFailure(code: FailureCode): void
  sendResponse(answer: A | Failure): void
}

export function relayReportingFailures<A extends Answered>(relayed: Relayed<A>): void {
  const { reportFailure, sendResponse } = relayed
  step('offscreen-document', relayed.open)
    .then(() => step('offscreen-message', relayed.send))
    .then(
      answer => {
        if (answer.type === 'failed') reportFailure(relayed.answerCode)
        sendResponse(answer)
      },
      (failed: StepFailed) => {
        reportFailure(failed.code)
        sendResponse(failure(failed.error))
      }
    )
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
    relayReportingFailures({
      open: () => relay.ensureOffscreenDocument(),
      send: () => relay.sendMessage({ target: 'offscreen', request }),
      answerCode: 'dictionary-answer',
      reportFailure: code => relay.reportFailure(code),
      sendResponse
    })
    return true
  }
}

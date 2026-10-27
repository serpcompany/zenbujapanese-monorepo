import {
  type DictionaryAnswer,
  type Envelope,
  type Failure,
  failure,
  isEnvelopeFor,
  isOffscreenStarted
} from '../shared/messages'

type Relay = {
  ensureOffscreenDocument(): Promise<void>
  offscreenDocumentStarted(): void
  sendMessage(message: Envelope): Promise<DictionaryAnswer | Failure>
}

export function routeToOffscreen(relay: Relay) {
  return (
    message: unknown,
    _sender: unknown,
    sendResponse: (answer: DictionaryAnswer | Failure) => void
  ): boolean => {
    if (isOffscreenStarted(message)) relay.offscreenDocumentStarted()
    if (!isEnvelopeFor('service-worker', message)) return false
    relay
      .ensureOffscreenDocument()
      .then(() => relay.sendMessage({ target: 'offscreen', request: message.request }))
      .then(sendResponse, (error: unknown) => sendResponse(failure(error)))
    return true
  }
}

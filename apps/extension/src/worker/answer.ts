import type { DictionaryAnswer, DictionaryRequest, Failure } from '../shared/messages'

export function answer(request: DictionaryRequest): DictionaryAnswer | Failure {
  switch (request.type) {
    case 'ping':
      return { type: 'pong', from: 'dictionary-worker' }
    default:
      return { type: 'failed', reason: 'The dictionary worker does not know this request.' }
  }
}

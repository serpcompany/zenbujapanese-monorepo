import type { DictionaryAnswer, DictionaryRequest } from '../shared/messages'

export function answer(request: DictionaryRequest): DictionaryAnswer {
  switch (request.type) {
    case 'ping':
      return { type: 'pong', from: 'dictionary-worker' }
  }
}

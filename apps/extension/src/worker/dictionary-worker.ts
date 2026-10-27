import type { DictionaryRequest } from '../shared/messages'
import { answer } from './answer'

self.addEventListener('message', (event: MessageEvent<DictionaryRequest>) => {
  const [port] = event.ports
  port?.postMessage(answer(event.data))
})

self.postMessage('started')

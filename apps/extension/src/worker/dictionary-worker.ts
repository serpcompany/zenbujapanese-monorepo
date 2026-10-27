import { startErrorReports } from '../error-reports/error-reports'
import type { DictionaryRequest } from '../shared/messages'
import { answer } from './answer'

startErrorReports('worker')

self.addEventListener('message', (event: MessageEvent<DictionaryRequest>) => {
  const [port] = event.ports
  port?.postMessage(answer(event.data))
})

self.postMessage('started')

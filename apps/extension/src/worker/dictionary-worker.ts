import { startErrorReports } from '../error-reports/error-reports'
import type { DictionaryRequest } from '../shared/messages'
import { answer, type WorkerData } from './answer'
import { installer } from './installer'
import { type OpenDictionary, openDictionary } from './open-dictionary'
import { openedOnce } from './opened-once'
import { openPool } from './sqlite'
import { originPrivateStorage } from './storage'

const storage = originPrivateStorage()
const languageDataPool = openedOnce(openPool)
let current: OpenDictionary | null = null

const languageData = installer({
  fetch: (url, init) => fetch(url, init),
  storage,
  pool: languageDataPool,
  async open(installed) {
    const next = await openDictionary(await languageDataPool(), storage, installed)
    const previous = current
    current = next
    previous?.close()
  }
})

const worker: WorkerData = {
  state: languageData.state,
  open: () => current,
  update: () => {
    languageData.update()
  }
}

startErrorReports('worker', message => self.postMessage(message))

self.addEventListener('message', async (event: MessageEvent<DictionaryRequest>) => {
  const [port] = event.ports
  port?.postMessage(await answer(event.data, worker))
})

self.postMessage('started')
languageData.start()

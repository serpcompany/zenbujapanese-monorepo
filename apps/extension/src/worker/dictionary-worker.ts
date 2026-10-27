import type { DictionaryRequest } from '../shared/messages'
import { answer, type WorkerData } from './answer'
import { installer } from './installer'
import { type OpenDictionary, openDictionary } from './open-dictionary'
import { openPool, type Pool } from './sqlite'
import { originPrivateStorage } from './storage'

const storage = originPrivateStorage()
let pool: Promise<Pool> | null = null
const languageDataPool = () => {
  pool ??= openPool()
  return pool
}
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

self.addEventListener('message', (event: MessageEvent<DictionaryRequest>) => {
  const [port] = event.ports
  port?.postMessage(answer(event.data, worker))
})

self.postMessage('started')
languageData.start()

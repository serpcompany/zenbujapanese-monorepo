import { askWorker, relayToWorker } from './relay'

const worker = new Worker(new URL('../worker/dictionary-worker.ts', import.meta.url), {
  type: 'module'
})

chrome.runtime.onMessage.addListener(relayToWorker(askWorker(worker)))

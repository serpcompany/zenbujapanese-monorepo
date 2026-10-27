import { onDeviceTranslation } from '../translation/translator'
import { announceStarted, askWorker, relayToWorker } from './relay'
import { answerTranslation } from './translation'

const startWorker = () =>
  new Worker(new URL('../worker/dictionary-worker.ts', import.meta.url), { type: 'module' })

chrome.runtime.onMessage.addListener(relayToWorker(askWorker(startWorker)))
chrome.runtime.onMessage.addListener(answerTranslation(onDeviceTranslation()))
announceStarted(chrome.runtime)

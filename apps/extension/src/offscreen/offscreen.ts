import { startErrorReports } from '../error-reports/error-reports'
import { announceStarted, askWorker, relayToWorker } from './relay'

startErrorReports('offscreen')

const startWorker = () =>
  new Worker(new URL('../worker/dictionary-worker.ts', import.meta.url), { type: 'module' })

chrome.runtime.onMessage.addListener(relayToWorker(askWorker(startWorker)))
announceStarted(chrome.runtime)

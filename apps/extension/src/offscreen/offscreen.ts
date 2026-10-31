import { startErrorReports } from '../error-reports/error-reports'
import { isErrorReport, toServiceWorker } from '../error-reports/forwarding'
import { onDeviceTranslation } from '../translation/translator'
import { announceStarted, askWorker, relayToWorker } from './relay'
import { answerTranslation } from './translation'

const forward = toServiceWorker(chrome.runtime)

startErrorReports('offscreen', forward)

function startWorker() {
  const worker = new Worker(new URL('../worker/dictionary-worker.ts', import.meta.url), {
    type: 'module'
  })
  worker.addEventListener('message', ({ data }) => {
    if (isErrorReport(data)) forward(data)
  })
  return worker
}

chrome.runtime.onMessage.addListener(relayToWorker(askWorker(startWorker)))
chrome.runtime.onMessage.addListener(answerTranslation(onDeviceTranslation()))
announceStarted(chrome.runtime)

import {
  receiveErrorReport,
  reportFailure,
  startSendingErrorReports
} from '../error-reports/error-reports'
import { offscreenDocumentKeeper } from './offscreen-document'
import { routeToOffscreen } from './router'
import { startSidePanel } from './side-panel'

startSendingErrorReports(chrome.storage.local)

const offscreenDocument = offscreenDocumentKeeper({
  getURL: path => chrome.runtime.getURL(path),
  getContexts: filter => chrome.runtime.getContexts(filter),
  createDocument: parameters => chrome.offscreen.createDocument(parameters)
})

chrome.runtime.onMessage.addListener(receiveErrorReport)

chrome.runtime.onMessage.addListener(
  routeToOffscreen({
    ensureOffscreenDocument: offscreenDocument.ensureOpen,
    offscreenDocumentStarted: offscreenDocument.documentStarted,
    sendMessage: message => chrome.runtime.sendMessage(message),
    reportFailure
  })
)

startSidePanel()

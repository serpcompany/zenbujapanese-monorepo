import { offscreenDocumentKeeper } from './offscreen-document'
import { routeToOffscreen } from './router'

const offscreenDocument = offscreenDocumentKeeper({
  getURL: path => chrome.runtime.getURL(path),
  getContexts: filter => chrome.runtime.getContexts(filter),
  createDocument: parameters => chrome.offscreen.createDocument(parameters)
})

chrome.runtime.onMessage.addListener(
  routeToOffscreen({
    ensureOffscreenDocument: offscreenDocument.ensureOpen,
    offscreenDocumentStarted: offscreenDocument.documentStarted,
    sendMessage: message => chrome.runtime.sendMessage(message)
  })
)

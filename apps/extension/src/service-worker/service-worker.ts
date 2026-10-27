import { keepLanguageDataCurrent } from './language-data-updates'
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

keepLanguageDataCurrent({
  onInstalled: chrome.runtime.onInstalled,
  onStartup: chrome.runtime.onStartup,
  onAlarm: chrome.alarms.onAlarm,
  createAlarm: (name, info) => chrome.alarms.create(name, info),
  hasAlarm: async name => (await chrome.alarms.get(name)) !== undefined,
  openTab: path => chrome.tabs.create({ url: chrome.runtime.getURL(path) }),
  ask: async request => {
    await offscreenDocument.ensureOpen()
    return chrome.runtime.sendMessage({ target: 'offscreen', request })
  }
})

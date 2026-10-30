import { contentScriptErrorReports } from '../error-reports/error-reports'
import { toServiceWorker } from '../error-reports/forwarding'
import { startUnlessRunning } from '../page-lookup/hand-over'
import { isReadPageSelection, isStopPageLookup } from '../page-lookup/messages'
import { startPageLookup } from '../page-lookup/page-lookup'
import { afterTimeout } from '../page-lookup/scan'
import { selectedPageText } from '../page-lookup/selection'
import { pageUnderlines } from '../page-lookup/underline'
import { lookUpPopupCard, segmentText } from '../shared/dictionary'
import { askSettings, onSettingsChanged } from '../shared/settings'
import { wordPopupHost } from '../word-popup/popup-host'

const alive = () => chrome.runtime?.id !== undefined

const started = startUnlessRunning(document, alive, () => {
  const { report } = contentScriptErrorReports(toServiceWorker(chrome.runtime))
  const lookup = startPageLookup({
    doc: document,
    view: window,
    host: location.hostname,
    askSettings: () => askSettings(),
    onSettingsChanged: listener => onSettingsChanged(listener),
    segment: text => segmentText(text),
    popupCard: (id, frequency) => lookUpPopupCard(id, frequency),
    underlines: () => pageUnderlines(document),
    popup: settings => wordPopupHost({ settings, report }),
    report,
    wait: afterTimeout
  })
  const onMessage = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    answer: (response: unknown) => void
  ) => {
    if (isReadPageSelection(message)) {
      answer({ selection: selectedPageText(getSelection()) })
      return false
    }
    if (isStopPageLookup(message)) started?.stop()
    return false
  }
  chrome.runtime.onMessage.addListener(onMessage)
  return {
    stop() {
      lookup.stop()
      if (alive()) chrome.runtime.onMessage.removeListener(onMessage)
    }
  }
})

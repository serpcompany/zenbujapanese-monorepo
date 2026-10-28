import { contentScriptErrorReports } from '../error-reports/error-reports'
import { toServiceWorker } from '../error-reports/forwarding'
import { isReadPageSelection, isStopPageLookup } from '../page-lookup/messages'
import { startPageLookup } from '../page-lookup/page-lookup'
import { selectedPageText } from '../page-lookup/selection'
import { pageUnderlines } from '../page-lookup/underline'
import { lookUpPopupCard, segmentText } from '../shared/dictionary'
import { askSettings, onSettingsChanged } from '../shared/settings'
import { openPanel } from '../side-panel/route'
import { wordPopupHost } from '../word-popup/popup-host'

const started = Symbol.for('zenbujapanese.page-lookup')

type Scope = { [started]?: true }

const scope = globalThis as Scope

if (!scope[started]) {
  scope[started] = true
  const { report } = contentScriptErrorReports(toServiceWorker(chrome.runtime))
  const lookup = startPageLookup({
    doc: document,
    view: window,
    host: location.hostname,
    askSettings: () => askSettings(),
    onSettingsChanged: listener => onSettingsChanged(listener),
    segment: text => segmentText(text),
    popupCard: (id, frequency) => lookUpPopupCard(id, frequency),
    openPanel: route => void openPanel(route),
    underlines: () => pageUnderlines(document),
    popup: settings => wordPopupHost({ settings, report }),
    report,
    wait: milliseconds => new Promise(done => setTimeout(done, milliseconds))
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
    if (!isStopPageLookup(message)) return false
    lookup.stop()
    chrome.runtime.onMessage.removeListener(onMessage)
    delete scope[started]
    return false
  }
  chrome.runtime.onMessage.addListener(onMessage)
}

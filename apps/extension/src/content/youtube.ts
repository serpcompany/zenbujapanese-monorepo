import { contentScriptErrorReports } from '../error-reports/error-reports'
import { toServiceWorker } from '../error-reports/forwarding'
import { afterTimeout } from '../page-lookup/scan'
import { keptInside } from '../player-captions/kept-inside'
import { playerCaptions } from '../player-captions/player-captions'
import { lookUpPopupCard, segmentText } from '../shared/dictionary'
import {
  askSettings,
  isZenbuOn,
  onSettingsChanged,
  type Settings,
  writeSettings
} from '../shared/settings'
import { translate } from '../translation/messages'
import { followYouTubePage } from '../video/youtube-page'
import { servePagePopups } from '../word-popup/page-popup-server'
import { wordPopupHost } from '../word-popup/popup-host'
import { popupSettings } from '../word-popup/popup-settings'

const { report } = contentScriptErrorReports(toServiceWorker(chrome.runtime))

const popupCard = (id: string, frequency: readonly string[]) => lookUpPopupCard(id, frequency)

const pageSettings = {
  ask: () => askSettings(),
  onChanged: (listener: (settings: Settings) => void) => onSettingsChanged(listener)
}

followYouTubePage(document, {
  captions: {
    settings: pageSettings,
    show: playerCaptions({
      report,
      services: {
        segment: text => segmentText(text),
        wait: afterTimeout,
        popupCard,
        translate: request => translate(request),
        keepCaptionPlace: place =>
          void writeSettings({ 'videos.captionPlace': place }).catch(report)
      }
    })
  }
})

servePagePopups({
  runtime: chrome.runtime,
  view: window,
  settings: pageSettings,
  on: settings => isZenbuOn(location.hostname, settings),
  preferred: true,
  popup: settings =>
    wordPopupHost({
      report,
      prepare: keptInside,
      settings: () => popupSettings(settings(), { popupCard })
    })
})

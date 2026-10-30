import { contentScriptErrorReports } from '../error-reports/error-reports'
import { toServiceWorker } from '../error-reports/forwarding'
import { afterTimeout } from '../page-lookup/scan'
import { playerCaptions } from '../player-captions/player-captions'
import { lookUpPopupCard, segmentText } from '../shared/dictionary'
import { askSettings, onSettingsChanged, writeSettings } from '../shared/settings'
import { translate } from '../translation/messages'
import { followYouTubePage } from '../video/youtube-page'

const { report } = contentScriptErrorReports(toServiceWorker(chrome.runtime))

followYouTubePage(document, {
  captions: {
    settings: {
      ask: () => askSettings(),
      onChanged: listener => onSettingsChanged(listener)
    },
    show: playerCaptions({
      report,
      services: {
        segment: text => segmentText(text),
        wait: afterTimeout,
        popupCard: (id, frequency) => lookUpPopupCard(id, frequency),
        translate: request => translate(request),
        keepCaptionPlace: place =>
          void writeSettings({ 'videos.captionPlace': place }).catch(report)
      }
    })
  }
})

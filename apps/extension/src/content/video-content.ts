import { contentScriptErrorReports } from '../error-reports/error-reports'
import { toServiceWorker } from '../error-reports/forwarding'
import { afterTimeout } from '../page-lookup/scan'
import { keptInside } from '../player-captions/kept-inside'
import { playerCaptions } from '../player-captions/player-captions'
import { lookUpPopupCard, segmentText } from '../shared/dictionary'
import {
  askSettings,
  askToWriteSettings,
  isZenbuOn,
  onSettingsChanged,
  type Settings
} from '../shared/settings'
import { translate } from '../translation/messages'
import { followVideoPage, type VideoSitePage } from '../video/video-page'
import { onDeviceShareServices } from '../video-tab/known-share'
import { servePagePopups } from '../word-popup/page-popup-server'
import { wordPopupHost } from '../word-popup/popup-host'
import { popupSettings } from '../word-popup/popup-settings'
import { chromeSaving } from '../word-saving/saving'

const popupCard = (id: string, frequency: readonly string[]) => lookUpPopupCard(id, frequency)

const pageSettings = {
  ask: () => askSettings(),
  onChanged: (listener: (settings: Settings) => void) => onSettingsChanged(listener)
}

export function startVideoContent(site: VideoSitePage): void {
  const { report } = contentScriptErrorReports(toServiceWorker(chrome.runtime))
  followVideoPage(document, site, {
    captions: {
      settings: pageSettings,
      show: playerCaptions({
        report,
        services: {
          segment: text => segmentText(text),
          wait: afterTimeout,
          popupCard,
          saving: chromeSaving,
          ...onDeviceShareServices,
          translate: request => translate(request),
          keepCaptionPlaces: places => void askToWriteSettings(places).catch(report)
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
        settings: () => popupSettings(settings(), { popupCard, saving: chromeSaving })
      })
  })
}

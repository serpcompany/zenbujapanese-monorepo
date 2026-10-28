import type { Settings } from '../shared/settings'
import type { PanelRoute } from '../side-panel/route'
import type { PopupSettings } from './popup-host'
import type { WordLookUp } from './use-cards'

export type PopupBrowser = {
  popupCard(languageReferenceID: string, frequency: readonly string[]): ReturnType<WordLookUp>
  openPanel(route: PanelRoute): void
}

export function popupSettings(
  settings: Settings,
  browser: PopupBrowser,
  close: () => void
): PopupSettings {
  const frequency = settings['frequencyDictionaries.chosen']
  return {
    lookUp: id => browser.popupCard(id, frequency),
    frequency,
    romaji: settings['readingAids.romaji'],
    openFullEntry(page) {
      browser.openPanel({ page })
      close()
    }
  }
}

import type { Settings } from '../shared/settings'
import type { PopupSettings } from './popup-host'
import type { WordLookUp } from './use-cards'

export type PopupBrowser = {
  popupCard(languageReferenceID: string, frequency: readonly string[]): ReturnType<WordLookUp>
}

export function popupSettings(settings: Settings, browser: PopupBrowser): PopupSettings {
  const frequency = settings['frequencyDictionaries.chosen']
  return { lookUp: id => browser.popupCard(id, frequency), settings }
}

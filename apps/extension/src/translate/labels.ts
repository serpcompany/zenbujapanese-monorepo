import { labels } from '../shared/labels'
import type { Direction, Language } from '../translation/messages'

const languageNames: Record<Language, string> = { ja: 'Japanese', en: 'English' }

export const translateLabels = {
  box: 'Text to translate',
  placeholder: 'Type or paste Japanese or English',
  useSelection: 'Use Selection',
  clear: 'Clear',
  translate: 'Translate',
  translating: 'Translating…',
  onThisDevice: 'Translated on this device',
  copy: 'Copy',
  copied: 'Copied',
  speak: 'Speak',
  noVoice: (language: Language) =>
    `There's no ${languageNames[language]} voice on this computer to speak it.`,
  direction: ({ from, to }: Direction) => `${languageNames[from]} → ${languageNames[to]}`,
  notices: {
    unavailable: "Translate isn't available on this computer.",
    downloadFailed: labels.translation.downloadFailed,
    failed: "Translate didn't answer. Try again.",
    noLanguage: 'Type Japanese or English to translate.',
    nothingSelected: 'Nothing is selected.',
    selectionUnreadable: "Can't read the selection on this page. Copy and paste it instead."
  }
}

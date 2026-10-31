import { useCallback } from 'react'
import type { Settings } from '../shared/settings'
import { chromeSaving } from '../word-saving/saving'
import { keepPress, type PanelWord } from './panel-word'
import type { PopupBrowser } from './popup-settings'
import { WordPopup } from './word-popup'

export function InlineCard({
  word,
  settings,
  popupCard,
  className = ''
}: {
  word: PanelWord
  settings: Settings
  popupCard: PopupBrowser['popupCard']
  className?: string
}) {
  const frequency = settings['frequencyDictionaries.chosen']
  const lookUp = useCallback((id: string) => popupCard(id, frequency), [popupCard, frequency])
  return (
    <section className={`${className} [&_[data-word-popup]]:max-w-full`} onPointerDown={keepPress}>
      <WordPopup
        text={word.text}
        ids={word.ids}
        lookUp={lookUp}
        settings={settings}
        saving={chromeSaving}
      />
    </section>
  )
}

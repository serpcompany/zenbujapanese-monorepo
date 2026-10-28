import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { useSyncExternalStore } from 'react'
import type { PageToken } from '../page-lookup/words'
import type { Settings } from '../shared/settings'
import type { SourceServices } from '../translate/source-words'
import { playerCaptionLabels as labels } from './labels'
import type { LineControls } from './line-controls'
import type { LineEnglish } from './line-english'
import { PlayerCaption } from './player-caption'
import { PlayerControls } from './player-controls'
import type { PopupHold } from './popup-hold'
import { usePointerOver } from './presence'

type SettingsSource = {
  get(): Settings
  subscribe(listener: () => void): () => void
}

export type OverlayProps = {
  player: HTMLElement
  lines: readonly Caption[]
  controls: LineControls
  hold: PopupHold
  english: LineEnglish
  services: SourceServices
  settings: SettingsSource
  pick(token: PageToken, word: HTMLElement): void
}

export function PlayerOverlay({
  player,
  lines,
  controls,
  hold,
  english,
  services,
  settings: source,
  pick
}: OverlayProps) {
  const view = useSyncExternalStore(controls.subscribe, controls.view)
  const popupOpen = useSyncExternalStore(hold.subscribe, hold.open)
  const pausing = useSyncExternalStore(hold.subscribe, hold.pausing)
  const settings = useSyncExternalStore(source.subscribe, source.get)
  const pointer = usePointerOver(player)
  if (!view.ready || view.ad) return null
  return (
    <div className="dark @container absolute inset-0 text-foreground">
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <PlayerControls controls={controls} view={view} pointer={pointer} popupOpen={popupOpen} />
        <output className="rounded-md bg-black/70 px-2 py-1 text-sm text-white empty:hidden">
          {pausing ? labels.pausedForPopup : null}
        </output>
      </div>
      {view.line === null ? null : (
        <div className="absolute inset-x-0 bottom-[max(64px,12%)] flex justify-center px-4">
          <PlayerCaption
            lines={lines}
            line={view.line}
            settings={settings}
            services={services}
            english={english}
            pick={pick}
          />
        </div>
      )}
    </div>
  )
}

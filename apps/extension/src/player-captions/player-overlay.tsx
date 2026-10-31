import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { useSyncExternalStore } from 'react'
import type { PageToken } from '../page-lookup/words'
import type { Settings } from '../shared/settings'
import type { SourceServices } from '../translate/source-words'
import type { KnownShare } from '../video-tab/known-share'
import { KnownPill } from './known-pill'
import { playerCaptionLabels as labels } from './labels'
import type { LineControls, LineView } from './line-controls'
import type { LineEnglish } from './line-english'
import { type KeepPlaces, PlayerCaption } from './player-caption'
import { PlayerControls } from './player-controls'
import type { PopupHold } from './popup-hold'
import { useControlsPresence, usePointerOver } from './presence'

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
  keepPlace: KeepPlaces
  share: KnownShare
}

type ShownProps = Omit<OverlayProps, 'player' | 'settings'> & {
  view: LineView
  pointer: boolean
  settings: Settings
}

function ShownOverlay({
  lines,
  controls,
  hold,
  english,
  services,
  settings,
  pick,
  keepPlace,
  share,
  view,
  pointer
}: ShownProps) {
  const popupOpen = useSyncExternalStore(hold.subscribe, hold.open)
  const pausing = useSyncExternalStore(hold.subscribe, hold.pausing)
  const presence = useControlsPresence(pointer, !view.playing, popupOpen)
  return (
    <div className="dark @container absolute inset-0 text-foreground">
      <div className="absolute top-3 left-3">
        <KnownPill share={share} shown={presence.shown} />
      </div>
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <PlayerControls controls={controls} view={view} presence={presence} />
        <output className="rounded-md bg-black/70 px-2 py-1 text-sm text-white empty:hidden">
          {pausing ? labels.pausedForPopup : null}
        </output>
      </div>
      {view.line === null ? null : (
        <PlayerCaption
          lines={lines}
          line={view.line}
          settings={settings}
          services={services}
          english={english}
          pick={pick}
          keepPlace={keepPlace}
        />
      )}
    </div>
  )
}

export function PlayerOverlay({ player, settings: source, ...shown }: OverlayProps) {
  const view = useSyncExternalStore(shown.controls.subscribe, shown.controls.view)
  const settings = useSyncExternalStore(source.subscribe, source.get)
  const pointer = usePointerOver(player)
  if (!view.ready || view.ad) return null
  return <ShownOverlay {...shown} view={view} pointer={pointer} settings={settings} />
}

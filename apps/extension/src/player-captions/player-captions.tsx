import { mountInShadowRoot, type ShadowMount } from '../content/shadow-mount'
import type { PageToken } from '../page-lookup/words'
import type { Settings } from '../shared/settings'
import type { SourceServices } from '../translate/source-words'
import type { VideoFollower } from '../video/follower'
import { wordPopupEvents } from '../word-popup/popup-events'
import { wordPopupHost } from '../word-popup/popup-host'
import { type PopupBrowser, popupSettings } from '../word-popup/popup-settings'
import { keptInside } from './kept-inside'
import { type CaptionedVideo, lineControls } from './line-controls'
import { lineEnglish, type Translate } from './line-english'
import { PlayerOverlay } from './player-overlay'
import { holdForPopups } from './popup-hold'

export const playerCaptionsAttribute = 'data-zenbu-player-captions'

export type CaptionServices = SourceServices & PopupBrowser & { translate: Translate }

export type ShownCaptions = {
  settingsChanged(settings: Settings): void
  seek(time: number): void
  stop(): void
}

export type ShowCaptions = (
  follower: VideoFollower,
  video: CaptionedVideo,
  settings: Settings
) => ShownCaptions

type Options = {
  services: CaptionServices
  report?: (error: unknown) => void
  doc?: Document
  view?: Window
  events?: EventTarget
}

const hostStyle = 'display:block;position:absolute;inset:0;pointer-events:none;z-index:60;'

export function playerCaptions({
  services,
  report,
  doc = document,
  view = window,
  events = wordPopupEvents()
}: Options): ShowCaptions {
  return (follower, video, initial) => {
    let settings = initial
    const heard = new Set<() => void>()
    const source = {
      get: () => settings,
      subscribe(listener: () => void) {
        heard.add(listener)
        return () => void heard.delete(listener)
      }
    }
    const controls = lineControls(follower, video)
    const hold = holdForPopups(follower, events, view)
    const english = lineEnglish(services.translate)
    const popup = wordPopupHost({
      doc,
      view,
      report,
      prepare: keptInside,
      settings: () => popupSettings(settings, services, popup.close)
    })
    const pick = (token: PageToken, word: HTMLElement) =>
      popup.open({ text: token.text, ids: token.ids, anchor: () => word.getBoundingClientRect() })
    let mounted: ShadowMount | null = null
    let siteCaptionsShown = false

    const followAd = () => {
      const ad = follower.playback?.ad === true
      if (ad === siteCaptionsShown) return
      siteCaptionsShown = ad
      follower.showSiteCaptions(ad)
    }

    const place = () => {
      followAd()
      const player = follower.captionHost()
      if (!player) return
      if (!mounted) {
        mounted = mountInShadowRoot(
          <PlayerOverlay
            player={player}
            lines={video.lines}
            controls={controls}
            hold={hold}
            english={english}
            services={services}
            settings={source}
            pick={pick}
          />,
          { document: doc, report }
        )
        mounted.host.setAttribute(playerCaptionsAttribute, '')
        mounted.host.setAttribute('style', hostStyle)
        keptInside(mounted)
      }
      if (mounted.host.parentNode !== player) player.append(mounted.host)
    }

    const unsubscribe = follower.subscribe(place)
    place()

    return {
      settingsChanged(next) {
        settings = next
        for (const listener of [...heard]) listener()
      },
      seek: time => controls.seek(time),
      stop() {
        unsubscribe()
        popup.close()
        hold.stop()
        controls.stop()
        heard.clear()
        mounted?.unmount()
        mounted = null
      }
    }
  }
}

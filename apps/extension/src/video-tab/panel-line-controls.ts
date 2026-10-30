import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { type LineControls, type LineView, lineControls } from '../player-captions/line-controls'
import type { VideoControl } from '../video/controls'
import type { Playback, VideoFollower } from '../video/follower'
import type { VideoTabServices } from './services'

type Remote = { follower: VideoFollower; heard(playback: Playback | null): void }

function remoteFollower(send: (control: VideoControl) => void): Remote {
  const listeners = new Set<(playback: Playback | null) => void>()
  let playback: Playback | null = null
  return {
    follower: {
      get playback() {
        return playback
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
      seek: time => send({ type: 'seek', time }),
      play: () => send({ type: 'play' }),
      pause: () => send({ type: 'pause' }),
      setRate: rate => send({ type: 'rate', rate }),
      captionHost: () => null,
      showSiteCaptions: () => undefined,
      stop: () => listeners.clear()
    },
    heard(next) {
      playback = next
      for (const listener of [...listeners]) listener(next)
    }
  }
}

export type PanelLines = { controls: LineControls; view: LineView; video: VideoFollower }

export function usePanelLines(
  services: VideoTabServices,
  tabId: number,
  videoId: string,
  lines: readonly Caption[],
  playback: Playback | null
): PanelLines {
  const remote = useMemo(
    () => remoteFollower(control => services.control(tabId, control)),
    [services, tabId]
  )
  const controls = useMemo(
    () => lineControls(remote.follower, { videoId, lines }),
    [remote, videoId, lines]
  )
  useEffect(() => () => controls.stop(), [controls])
  useEffect(() => remote.heard(playback), [remote, playback])
  const view = useSyncExternalStore(controls.subscribe, controls.view)
  return { controls, view, video: remote.follower }
}

export function currentCard(
  lines: readonly Caption[],
  playback: Playback | null,
  view: LineView
): number | null {
  if (!playback || playback.ad || !view.ready) return null
  return (
    view.line ??
    Math.max(
      0,
      lines.findLastIndex(line => line.start <= playback.time)
    )
  )
}

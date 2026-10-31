import type { VideoControl } from '../video/controls'
import type { Playback, VideoFollower } from '../video/follower'

type Listener = (playback: Playback | null) => void

export function followerStandIn() {
  const listeners = new Set<Listener>()
  const controls: VideoControl[] = []
  let playback: Playback | null = null

  const tell = () => {
    for (const listener of [...listeners]) listener(playback)
  }

  const change = (next: Partial<Playback>) => {
    if (!playback) return
    playback = { ...playback, ...next }
    tell()
  }

  const control = (sent: VideoControl, next: Partial<Playback>) => {
    controls.push(sent)
    if (!playback?.ad) change(next)
  }

  const follow = (_page: Document, videoId: string): VideoFollower => {
    playback = { videoId, time: 0, playing: false, rate: 1, ad: false, ended: false }
    return {
      get playback() {
        return playback
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
      seek: time => control({ type: 'seek', time }, { time }),
      play: () => control({ type: 'play' }, { playing: true }),
      pause: () => control({ type: 'pause' }, { playing: false }),
      setRate: rate => control({ type: 'rate', rate }, { rate }),
      captionHost: () => null,
      showSiteCaptions: () => undefined,
      stop() {
        playback = null
        tell()
        listeners.clear()
      }
    }
  }

  return {
    follow,
    controls,
    plays: (time: number) => change({ time, playing: true }),
    adStarts: () => change({ ad: true, playing: false }),
    adEnds: () => change({ ad: false }),
    listening: () => listeners.size
  }
}

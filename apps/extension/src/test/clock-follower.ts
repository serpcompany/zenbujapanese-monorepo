import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import type { Playback, VideoFollower } from '../video/follower'

type Listener = (playback: Playback | null) => void

type Options = {
  videoId?: string
  duration?: number
  frame?: number
  host?: HTMLElement | null
  landing?: number
}

export const clockLines: Caption[] = [
  { id: 0, start: 1, end: 3, text: 'おはようございます', translation: null },
  { id: 1, start: 3, end: 6.5, text: '今日はいい天気ですね', translation: null },
  { id: 2, start: 8, end: 10, text: '散歩に行きましょう', translation: null },
  { id: 3, start: 10, end: 13, text: '要求が要る。', translation: null }
]

export const clockVideo = { videoId: 'zenbuJa0001', lines: clockLines }

export function clockFollower({
  videoId = clockVideo.videoId,
  duration = 60,
  frame = 20,
  host = null,
  landing = 0
}: Options = {}) {
  const listeners = new Set<Listener>()
  const seeks: { to: number; at: number }[] = []
  const rates: number[] = []
  const siteCaptions: boolean[] = []
  let shownVideo = videoId
  let time = 0
  let playing = false
  let rate = 1
  let ad = false
  let stopped = false
  let ticking: ReturnType<typeof setInterval> | undefined

  const snapshot = (): Playback | null =>
    stopped
      ? null
      : {
          videoId: shownVideo,
          time,
          playing: playing && !ad,
          rate,
          ad,
          ended: !ad && time >= duration
        }

  const tell = () => {
    const playback = snapshot()
    for (const listener of [...listeners]) listener(playback)
  }

  const tick = () => {
    if (!playing || ad) return
    time = Math.min(duration, time + (frame / 1000) * rate)
    if (time >= duration) playing = false
    tell()
  }

  const later = () => queueMicrotask(tell)

  const control = (act: () => void) => {
    if (ad || stopped) return
    act()
    later()
  }

  const follower: VideoFollower = {
    get playback() {
      return snapshot()
    },
    subscribe(listener) {
      listeners.add(listener)
      ticking ??= setInterval(tick, frame)
      return () => void listeners.delete(listener)
    },
    seek: to =>
      control(() => {
        seeks.push({ to, at: Date.now() })
        time = Math.min(Math.max(to + landing, 0), duration)
      }),
    play: () =>
      control(() => {
        if (time >= duration) time = 0
        playing = true
      }),
    pause: () =>
      control(() => {
        playing = false
      }),
    setRate: next =>
      control(() => {
        rates.push(next)
        rate = next
      }),
    captionHost: () => host,
    showSiteCaptions: shown => void siteCaptions.push(shown),
    stop() {
      stopped = true
      clearInterval(ticking)
      tell()
      listeners.clear()
    }
  }

  return {
    follower,
    seeks,
    rates,
    siteCaptions,
    time: () => time,
    playing: () => playing && !ad,
    learnerPlays() {
      playing = true
      later()
    },
    learnerPauses() {
      playing = false
      later()
    },
    learnerSeeks(to: number) {
      time = to
      later()
    },
    adStarts() {
      ad = true
      later()
    },
    adEnds() {
      ad = false
      later()
    },
    videoChanges(to: string) {
      shownVideo = to
      time = 0
      later()
    }
  }
}

export type ClockFollower = ReturnType<typeof clockFollower>

import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { currentLine, type Playback, type VideoFollower } from '../video/follower'

export const speeds = [0.5, 0.75, 1, 1.25, 1.5] as const

export type LineView = {
  line: number | null
  playing: boolean
  repeating: boolean
  rate: number
  ad: boolean
  ready: boolean
}

export type LineControls = {
  view(): LineView
  subscribe(listener: () => void): () => void
  previous(): void
  next(): void
  togglePlay(): void
  toggleRepeat(): void
  setRate(rate: number): void
  seek(time: number): void
  stop(): void
}

type Stretch = { line: number; started: boolean }

const playingSlack = 0.5
const pausedStep = 0.05
const backStep = 0.05

const idle: LineView = {
  line: null,
  playing: false,
  repeating: false,
  rate: 1,
  ad: false,
  ready: false
}

function lastStarted(lines: readonly Caption[], time: number): number {
  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >>> 1
    if (lines[middle].start <= time) {
      found = middle
      low = middle + 1
    } else high = middle - 1
  }
  return found
}

const sameView = (left: LineView, right: LineView) =>
  left.line === right.line &&
  left.playing === right.playing &&
  left.repeating === right.repeating &&
  left.rate === right.rate &&
  left.ad === right.ad &&
  left.ready === right.ready

const jumped = (from: number, to: number, allowed: number) => {
  const step = to - from
  return step < -backStep || step > allowed
}

export function lineControls(
  follower: VideoFollower,
  lines: readonly Caption[],
  now: () => number = Date.now
): LineControls {
  const listeners = new Set<() => void>()
  let playback: Playback | null = follower.playback
  let heardAt = now()
  let repeat: number | null = null
  let stretch: Stretch | null = null
  let held: number | null = null
  let expected: number | null = null
  let shown: LineView = idle

  const clamp = (index: number) => Math.min(Math.max(index, 0), lines.length - 1)

  const shownLine = (at: Playback): number | null =>
    stretch?.line ?? held ?? repeat ?? currentLine(lines, at.time)

  const publish = () => {
    const next: LineView = playback
      ? {
          line: playback.ad ? null : shownLine(playback),
          playing: playback.playing,
          repeating: repeat !== null,
          rate: playback.rate,
          ad: playback.ad,
          ready: lines.length > 0
        }
      : idle
    if (sameView(shown, next)) return
    shown = next
    for (const listener of [...listeners]) listener()
  }

  const seekTo = (time: number) => {
    expected = time
    follower.seek(time)
  }

  const usable = (): Playback | null =>
    playback && !playback.ad && lines.length > 0 ? playback : null

  const moved = (time: number) => {
    stretch = null
    held = null
    if (repeat === null) return
    repeat = clamp(lastStarted(lines, time))
    const line = lines[repeat]
    if (time < line.start || time >= line.end) seekTo(line.start)
  }

  const followed = (before: number, at: Playback, wasPlaying: boolean) => {
    if (stretch) {
      const line = lines[stretch.line]
      if (at.playing) stretch.started = true
      if (at.time >= line.end) {
        held = stretch.line
        stretch = null
        follower.pause()
      } else if (stretch.started && !at.playing) stretch = null
      return
    }
    if (held !== null && at.playing) held = null
    if (repeat === null) return
    const line = lines[repeat]
    if (before >= line.end || at.time < line.end) return
    seekTo(line.start)
    if (wasPlaying && !at.playing) follower.play()
  }

  const heard = (next: Playback | null) => {
    if (!next) {
      playback = null
      repeat = null
      stretch = null
      held = null
      expected = null
      publish()
      return
    }
    if (next.ad || lines.length === 0) {
      playback = next
      heardAt = now()
      publish()
      return
    }
    const before = expected ?? playback?.time ?? next.time
    const wasPlaying = playback?.playing === true && !playback.ad
    const elapsed = (now() - heardAt) / 1000
    const allowed =
      wasPlaying || next.playing ? elapsed * Math.max(next.rate, 1) + playingSlack : pausedStep
    expected = null
    playback = next
    heardAt = now()
    if (jumped(before, next.time, allowed)) moved(next.time)
    else followed(before, next, wasPlaying)
    publish()
  }

  const step = (offset: number) => {
    const at = usable()
    if (!at) return
    const base = stretch?.line ?? held ?? repeat ?? lastStarted(lines, at.time)
    const target = clamp(base + offset)
    const start = lines[target].start
    held = null
    if (repeat !== null) {
      repeat = target
      seekTo(start)
    } else if (at.playing && !stretch) seekTo(start)
    else {
      stretch = { line: target, started: false }
      seekTo(start)
      follower.play()
    }
    publish()
  }

  const unsubscribe = follower.subscribe(heard)
  publish()

  return {
    view: () => shown,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    previous: () => step(-1),
    next: () => step(1),
    togglePlay() {
      const at = usable()
      if (!at) return
      if (!at.playing) return follower.play()
      stretch = null
      follower.pause()
    },
    toggleRepeat() {
      const at = usable()
      if (!at) return
      if (repeat !== null) {
        repeat = null
        return publish()
      }
      const index = stretch?.line ?? held ?? clamp(lastStarted(lines, at.time))
      const line = lines[index]
      stretch = null
      held = null
      repeat = index
      if (!at.playing || at.time < line.start || at.time >= line.end) seekTo(line.start)
      publish()
    },
    setRate(rate) {
      if (usable()) follower.setRate(rate)
    },
    seek(time) {
      if (!playback || playback.ad) return
      seekTo(time)
      moved(time)
      publish()
    },
    stop() {
      unsubscribe()
      listeners.clear()
    }
  }
}

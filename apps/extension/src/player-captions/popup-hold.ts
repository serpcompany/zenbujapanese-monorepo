import type { VideoFollower } from '../video/follower'
import { popupPause } from '../video/popup-pause'

export type PopupHold = {
  open(): boolean
  pausing(): boolean
  subscribe(listener: () => void): () => void
  stop(): void
}

const pressEnds = ['pointerup', 'pointercancel'] as const

export function holdForPopups(
  follower: VideoFollower,
  events: EventTarget,
  view: Window
): PopupHold {
  const listeners = new Set<() => void>()
  const pause = popupPause({
    playing: () => follower.playback?.playing === true,
    play: () => follower.play(),
    pause: () => follower.pause()
  })
  let open = false
  let closing = false
  let pressed = false

  const tell = () => {
    for (const listener of [...listeners]) listener()
  }

  const settle = () => {
    if (!closing || pressed) return
    closing = false
    open = false
    pause.changed(false)
    tell()
  }

  const opened = () => {
    closing = false
    if (open) return
    open = true
    pause.changed(true)
    tell()
  }

  const closed = () => {
    closing = true
    settle()
  }

  const pressStarted = () => {
    pressed = true
  }

  const pressEnded = () => {
    pressed = false
    view.setTimeout(settle, 0)
  }

  events.addEventListener('open', opened)
  events.addEventListener('close', closed)
  view.addEventListener('pointerdown', pressStarted, true)
  for (const type of pressEnds) view.addEventListener(type, pressEnded, true)

  return {
    open: () => open,
    pausing: () => open && pause.pausing(),
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    stop() {
      events.removeEventListener('open', opened)
      events.removeEventListener('close', closed)
      view.removeEventListener('pointerdown', pressStarted, true)
      for (const type of pressEnds) view.removeEventListener(type, pressEnded, true)
      listeners.clear()
      if (!open) return
      open = false
      closing = false
      pause.changed(false)
    }
  }
}

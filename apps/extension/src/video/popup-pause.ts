export type PausedVideo = {
  playing(): boolean
  play(): void
  pause(): void
}

export type PopupPause = {
  changed(open: boolean): void
  pausing(): boolean
}

export function popupPause(video: PausedVideo): PopupPause {
  let open = false
  let resume = false
  return {
    changed(next) {
      if (next === open) return
      open = next
      if (open) {
        resume = video.playing()
        video.pause()
        return
      }
      if (!resume) return
      resume = false
      video.play()
    },
    pausing: () => open && resume
  }
}

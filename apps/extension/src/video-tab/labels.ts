const twoDigits = (value: number) => String(value).padStart(2, '0')

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = twoDigits(whole % 60)
  return hours > 0 ? `${hours}:${twoDigits(minutes)}:${rest}` : `${minutes}:${rest}`
}

export const videoTabLabels = {
  loading: "Getting this video's captions…",
  transcript: 'Transcript',
  clock,
  timeRange: (start: number, end: number) => `${clock(start)} – ${clock(end)}`,
  playFrom: (seconds: number) => `Play from ${clock(seconds)}`,
  controls: 'Player controls',
  closeWord: 'Close',
  fullHeight: 'Full height',
  halfHeight: 'Half height',
  englishNeedsDownload:
    "To see each line in English, download Chrome's own Japanese translation. It's apart from Zenbu's dictionary.",
  noAnswer: "Zenbu didn't answer. Try again.",
  reloadToFollow: 'Reload this tab to follow the video.',
  reload: 'Reload',
  englishFailed: "Translate didn't answer."
}

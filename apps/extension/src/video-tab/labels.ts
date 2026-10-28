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
  goTo: (seconds: number) => `Go to ${clock(seconds)}`,
  englishNeedsDownload: 'Download Japanese for Translate to see each line in English.',
  download: 'Download',
  noAnswer: "Zenbu didn't answer. Try again."
}

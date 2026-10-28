const speed = (rate: number) => `${rate}×`

export const playerCaptionLabels = {
  controls: 'Zenbu player controls',
  previousLine: 'Previous line',
  nextLine: 'Next line',
  play: 'Play',
  pause: 'Pause',
  repeatLine: 'Repeat line',
  speed,
  speedMenu: (rate: number) => `Speed, ${speed(rate)}`,
  pausedForPopup: 'Paused while the popup is open'
}

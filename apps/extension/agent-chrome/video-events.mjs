function logVideoEvents() {
  const log = event => {
    const video = event.target
    if (!(video instanceof HTMLMediaElement)) return
    const time = video.currentTime.toFixed(3)
    console.log(`[video] ${event.type} currentTime=${time} muted=${video.muted}`)
  }
  for (const type of ['play', 'pause', 'seeking', 'seeked']) {
    document.addEventListener(type, log, true)
  }
}

export const videoEvents = {
  source: `(${logVideoEvents})()`,
  worldName: 'zenbu-harness',
  runImmediately: true
}

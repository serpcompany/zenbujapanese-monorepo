function silentWav(seconds) {
  const rate = 8000
  const samples = rate * seconds
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const text = (offset, value) => {
    for (const [index, char] of [...value].entries()) {
      view.setUint8(offset + index, char.charCodeAt(0))
    }
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  text(36, 'data')
  view.setUint32(40, samples, true)
  bytes.fill(128, 44)
  return new Blob([bytes], { type: 'audio/wav' })
}

const video = document.createElement('video')
video.controls = true
video.width = 480
video.muted = true
const player = document.createElement('div')
player.id = 'movie_player'
player.append(video)
document.body.append(player)
video.src = URL.createObjectURL(silentWav(20))
console.log('[stand-in] watch page ready')

const trackHost = 'ipv4-c001-tyo001-ix.1.oca.nflxvideo.net'
const movieId = Number(location.pathname.split('/')[2])
const session = `watch-${movieId}`
const netflixVideo = document.querySelector('video')
const subtitles = document.querySelector('.player-timedtext')
const log = line => console.log(`[netflix] ${line}`)

const tracks = [
  { trackId: 'T:off', bcp47: 'none', rawTrackType: 'SUBTITLES', isNoneTrack: true },
  { trackId: 'T:ja-cc', bcp47: 'ja', rawTrackType: 'CLOSEDCAPTIONS' },
  { trackId: 'T:ja-forced', bcp47: 'ja', rawTrackType: 'SUBTITLES', isForcedNarrative: true },
  { trackId: 'T:ja-images', bcp47: 'ja', rawTrackType: 'SUBTITLES', isImageBased: true },
  { trackId: 'T:ja', bcp47: 'ja', rawTrackType: 'SUBTITLES' },
  { trackId: 'T:en', bcp47: 'en-US', rawTrackType: 'SUBTITLES' }
]
const loaded = new Set(['T:en'])
let showing = tracks[5]
let seekingByPlayer = false

const timedText = trackId => ({
  type: 'timedtext',
  trackId,
  urls: [{ url: `https://${trackHost}/?o=1&v=12&e=1700000000&t=${encodeURIComponent(trackId)}` }]
})

const resetSpeed = () => {
  seekingByPlayer = false
  setTimeout(() => {
    if (netflixVideo.playbackRate === 1) return
    log('reset the speed to 1 after a seek')
    netflixVideo.playbackRate = 1
  }, 300)
}

const sessionPlayer = {
  getMovieId: () => movieId,
  seek(milliseconds) {
    log(`seek ${milliseconds}`)
    seekingByPlayer = true
    netflixVideo.addEventListener('seeked', resetSpeed, { once: true })
    netflixVideo.currentTime = milliseconds / 1000
  },
  play() {
    log('play')
    netflixVideo.muted = true
    void netflixVideo.play()
  },
  pause() {
    log('pause')
    netflixVideo.pause()
  },
  setPlaybackRate(rate) {
    log(`rate ${rate}`)
    netflixVideo.playbackRate = rate
  },
  getTimedTextTrackList: () => tracks,
  getTimedTextTrack: () => showing,
  setTimedTextTrack(track) {
    log(`show ${track.trackId}`)
    showing = track
    setTimeout(() => {
      if (!track.isNoneTrack) loaded.add(track.trackId)
    }, 200)
    return Promise.resolve()
  }
}

const draw = () => {
  subtitles.textContent = `Netflix’s own subtitle, ${showing.trackId}, at ${netflixVideo.currentTime.toFixed(1)} s`
}

netflixVideo.addEventListener('seeking', () => {
  if (!seekingByPlayer) log(`M7375: the video's currentTime was set to ${netflixVideo.currentTime}`)
})
netflixVideo.addEventListener('timeupdate', draw)
window.netflix = {
  appContext: {
    state: {
      playerApp: {
        getAPI: () => ({
          videoPlayer: {
            getAllPlayerSessionIds: () => [session],
            getVideoPlayerBySessionId: id => (id === session ? sessionPlayer : undefined)
          }
        }),
        getState: () => ({
          videoPlayer: {
            cadmiumPlayerRepository: {
              playersById: {
                [session]: { streams: { media: { list: [...loaded].map(timedText) } } }
              }
            }
          }
        })
      }
    }
  }
}
draw()
log(`watch page ready for ${movieId}`)

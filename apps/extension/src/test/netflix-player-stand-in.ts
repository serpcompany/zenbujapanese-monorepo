import { trackURL } from '../captions/fixtures/netflix-stand-in'
import type { NetflixTrack, NetflixWindow } from '../video/netflix-player'

export const standInTracks = {
  off: { trackId: 'T:off', bcp47: 'none', rawTrackType: 'SUBTITLES', isNoneTrack: true },
  japaneseCC: { trackId: 'T:ja-cc', bcp47: 'ja', rawTrackType: 'CLOSEDCAPTIONS' },
  japanese: { trackId: 'T:ja', bcp47: 'ja', rawTrackType: 'SUBTITLES' },
  japaneseForced: {
    trackId: 'T:ja-forced',
    bcp47: 'ja',
    rawTrackType: 'SUBTITLES',
    isForcedNarrative: true
  },
  japaneseImages: {
    trackId: 'T:ja-images',
    bcp47: 'ja',
    rawTrackType: 'SUBTITLES',
    isImageBased: true
  },
  english: { trackId: 'T:en', bcp47: 'en-US', rawTrackType: 'SUBTITLES' },
  french: { trackId: 'T:fr', bcp47: 'fr', rawTrackType: 'SUBTITLES' }
} satisfies Record<string, NetflixTrack & { trackId: string }>

const allTracks = Object.values(standInTracks)

const standInSession = 'watch-0123'

const playerPage =
  '<div class="watch-video--player-view"><video></video><div class="player-timedtext">Netflix caption</div></div>'

type Options = {
  videoId: string
  tracks?: readonly NetflixTrack[]
  loaded?: readonly string[]
  showing?: NetflixTrack | null
  listsOffOnceShown?: boolean
  ownRate?: boolean
  state?: Record<string, unknown>
}

export function netflixPlayerStandIn(view: NetflixWindow, options: Options) {
  const page = view.document
  page.body.innerHTML = playerPage
  const video = page.querySelector('video')
  if (!video) throw new Error('the stand-in Netflix page has no video')
  const calls: string[] = []
  const loaded = new Set(options.loaded ?? [])
  const tracks = options.tracks ?? allTracks
  let showing: NetflixTrack | null =
    options.showing === undefined ? standInTracks.off : options.showing
  let shown = false
  let time = 0
  let rate = 1
  let netflixRate = 1
  Object.defineProperties(video, {
    currentTime: {
      configurable: true,
      get: () => time,
      set: value => {
        calls.push(`M7375 currentTime ${value}`)
        time = value
      }
    },
    playbackRate: {
      configurable: true,
      get: () => rate,
      set: value => {
        if (value === rate) return
        rate = value
        video.dispatchEvent(new Event('ratechange'))
      }
    }
  })
  const timedText = () =>
    [...loaded].map(trackId => ({ type: 'timedtext', trackId, urls: [{ url: trackURL(trackId) }] }))
  const player = {
    getMovieId: () => Number(options.videoId),
    seek(milliseconds: number) {
      calls.push(`seek ${milliseconds}`)
      video.dispatchEvent(new Event('seeking'))
      time = milliseconds / 1000
      video.dispatchEvent(new Event('seeked'))
      view.setTimeout(() => {
        video.playbackRate = netflixRate
      })
    },
    play() {
      calls.push('play')
      void video.play()
    },
    pause() {
      calls.push('pause')
      video.pause()
    },
    getTimedTextTrackList: () =>
      shown && options.listsOffOnceShown ? [...tracks, standInTracks.off] : [...tracks],
    getTimedTextTrack: () => showing,
    setTimedTextTrack(track: NetflixTrack) {
      calls.push(`show ${String(track.trackId)}`)
      showing = track
      shown = true
      view.setTimeout(() => {
        if (!track.isNoneTrack) loaded.add(String(track.trackId))
      })
      return Promise.resolve()
    },
    ...(options.ownRate === false
      ? {}
      : {
          setPlaybackRate(next: number) {
            calls.push(`rate ${next}`)
            netflixRate = next
            video.playbackRate = next
          }
        })
  }
  const state = () => ({
    videoPlayer: {
      cadmiumPlayerRepository: {
        playersById: {
          [standInSession]: {
            ...options.state,
            buffer: new Uint8Array(8),
            streams: { media: { list: timedText() } }
          }
        }
      }
    }
  })
  view.netflix = {
    appContext: {
      state: {
        playerApp: {
          getAPI: () => ({
            videoPlayer: {
              getAllPlayerSessionIds: () => [standInSession],
              getVideoPlayerBySessionId: id => (id === standInSession ? player : undefined)
            }
          }),
          getState: state
        }
      }
    }
  }
  return {
    video,
    calls,
    showing: () => showing,
    setTime(seconds: number) {
      time = seconds
    },
    remove() {
      delete view.netflix
    }
  }
}

import {
  elementFollower,
  type Frames,
  type PlayerControls,
  type PlayerSite
} from './element-follower'
import type { VideoFollower } from './follower'

const elementControls = (video: HTMLVideoElement): PlayerControls => ({
  seek(time) {
    video.currentTime = time
  },
  play() {
    video.play().catch(() => undefined)
  },
  pause() {
    video.pause()
  },
  setRate(rate) {
    video.playbackRate = rate
  }
})

export const youTubeCaptions = '.ytp-caption-window-container'

const youTubePlayer: PlayerSite = {
  player: '#movie_player',
  siteCaptions: youTubeCaptions,
  adClass: 'ad-showing',
  controls: elementControls
}

export function youTubeFollower(page: Document, videoId: string, frames?: Frames): VideoFollower {
  return elementFollower(page, videoId, youTubePlayer, frames)
}

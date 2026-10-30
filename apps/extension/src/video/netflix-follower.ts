import {
  elementFollower,
  type Frames,
  type PlayerSite,
  siteCaptionsAttribute
} from './element-follower'
import type { VideoFollower } from './follower'
import type { NetflixBridge } from './netflix-bridge'

const player = '.watch-video--player-view'

const siteCaptions = '.player-timedtext'

const netflixPlayer = (videoId: string, bridge: NetflixBridge): PlayerSite => ({
  player,
  siteCaptionsRule: `${player}[${siteCaptionsAttribute}="hidden"] ${siteCaptions} { display: none !important; }`,
  holdsRateThroughSeeks: true,
  controls: () => ({
    seek: time => bridge.control(videoId, { type: 'seek', time }),
    play: () => bridge.control(videoId, { type: 'play' }),
    pause: () => bridge.control(videoId, { type: 'pause' }),
    setRate: rate => bridge.control(videoId, { type: 'rate', rate })
  })
})

export function netflixFollower(
  page: Document,
  videoId: string,
  bridge: NetflixBridge,
  frames?: Frames
): VideoFollower {
  return elementFollower(page, videoId, netflixPlayer(videoId, bridge), frames)
}

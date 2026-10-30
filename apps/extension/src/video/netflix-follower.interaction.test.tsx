import { afterEach, describe, expect, it } from 'vitest'
import { fakeFrames, mutationsSeen } from '../test/fake-frames'
import { netflixPlayerStandIn } from '../test/netflix-player-stand-in'
import { siteCaptionsAttribute } from './element-follower'
import type { VideoFollower } from './follower'
import { netflixBridge } from './netflix-bridge'
import { netflixFollower } from './netflix-follower'
import { type NetflixWindow, serveNetflixPlayer } from './netflix-player'

const videoId = '81234567'

const view = window as NetflixWindow

const stops: (() => void)[] = []

function follow(ownRate?: boolean) {
  const standIn = netflixPlayerStandIn(view, { videoId, ownRate })
  const follower: VideoFollower = netflixFollower(
    document,
    videoId,
    netflixBridge(document),
    fakeFrames()
  )
  stops.push(serveNetflixPlayer(view), standIn.remove, follower.stop)
  return { standIn, follower }
}

afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('netflixFollower', () => {
  it("follows Netflix's video and drives it through Netflix's player, never the video's currentTime", () => {
    const { standIn, follower } = follow()
    standIn.setTime(12)
    expect(follower.playback).toEqual({
      videoId,
      time: 12,
      playing: false,
      rate: 1,
      ad: false,
      ended: false
    })
    follower.seek(30)
    follower.play()
    follower.setRate(0.75)
    follower.pause()
    expect(standIn.calls).toEqual(['seek 30000', 'play', 'rate 0.75', 'pause'])
    expect(follower.playback).toEqual({
      videoId,
      time: 30,
      playing: false,
      rate: 0.75,
      ad: false,
      ended: false
    })
  })

  it("keeps the learner's 0.75x when Netflix puts its own speed back after a seek", async () => {
    const { standIn, follower } = follow(false)
    follower.setRate(0.75)
    follower.seek(40)
    await mutationsSeen()
    expect(standIn.video.playbackRate).toBe(0.75)
    expect(follower.playback).toMatchObject({ time: 40, rate: 0.75 })
    expect(standIn.calls).toEqual(['seek 40000'])
    follower.seek(50)
    await mutationsSeen()
    expect(standIn.video.playbackRate).toBe(0.75)
  })

  it("hides Netflix's captions on the player while asked, and gives the player as the caption host", () => {
    const { follower } = follow()
    const player = document.querySelector<HTMLElement>('.watch-video--player-view')
    const captions = document.querySelector<HTMLElement>('.player-timedtext')
    expect(follower.captionHost()).toBe(player)
    follower.showSiteCaptions(false)
    expect(player?.getAttribute(siteCaptionsAttribute)).toBe('hidden')
    expect(captions && getComputedStyle(captions).display).toBe('none')
    follower.showSiteCaptions(true)
    expect(player?.hasAttribute(siteCaptionsAttribute)).toBe(false)
  })
})

import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeFrames, mutationsSeen } from '../test/fake-frames'
import { siteCaptionsAttribute } from './element-follower'
import { type Playback, playingLine, type VideoFollower } from './follower'
import { youTubeFollower } from './youtube-follower'

const videoId = 'zenbuJa0001'

const lines: Caption[] = [
  { id: 0, start: 2, end: 4, text: 'おはようございます', translation: null },
  { id: 1, start: 40, end: 45, text: '散歩に行きましょう', translation: null }
]

const watchPageHTML =
  '<div id="movie_player" class="html5-video-player"><video></video><div class="ytp-caption-window-container">YouTube caption</div></div>'

function watchPage() {
  document.body.innerHTML = watchPageHTML
  const player = document.querySelector<HTMLElement>('#movie_player')
  const video = document.querySelector('video')
  if (!player || !video) throw new Error('the stand-in watch page has no player')
  return { player, video }
}

const followers: VideoFollower[] = []

function follow(frames = fakeFrames()) {
  const follower = youTubeFollower(document, videoId, frames)
  followers.push(follower)
  return follower
}

function setRate(video: HTMLVideoElement, rate: number) {
  video.playbackRate = rate
  video.dispatchEvent(new Event('ratechange'))
}

afterEach(() => {
  for (const follower of followers.splice(0)) follower.stop()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('youTubeFollower', () => {
  it("follows YouTube's video and drives it: seek, play, pause, and speed", async () => {
    const { video } = watchPage()
    const follower = follow()
    video.currentTime = 12
    expect(follower.playback).toEqual({
      videoId,
      time: 12,
      playing: false,
      rate: 1,
      ad: false,
      ended: false
    })
    follower.seek(30)
    expect(video.currentTime).toBe(30)
    follower.play()
    expect(video.paused).toBe(false)
    expect(follower.playback?.playing).toBe(true)
    follower.setRate(0.75)
    expect(video.playbackRate).toBe(0.75)
    expect(follower.playback?.rate).toBe(0.75)
    follower.pause()
    expect(video.paused).toBe(true)
    expect(follower.playback).toEqual({
      videoId,
      time: 30,
      playing: false,
      rate: 0.75,
      ad: false,
      ended: false
    })
  })

  it('says when the video has ended, which is not playing', () => {
    const { video } = watchPage()
    const follower = follow()
    video.currentTime = 12.8
    Object.defineProperty(video, 'ended', { configurable: true, value: true })
    video.dispatchEvent(new Event('ended'))
    expect(follower.playback).toMatchObject({ time: 12.8, playing: false, ended: true })
  })

  it("stops while an ad shows, with its time held and the controls off, then puts the learner's 0.75x back", async () => {
    const { player, video } = watchPage()
    const follower = follow()
    const seen: (Playback | null)[] = []
    follower.subscribe(playback => seen.push(playback))
    follower.setRate(0.75)
    video.currentTime = 42
    video.dispatchEvent(new Event('timeupdate'))
    player.classList.add('ad-showing')
    await mutationsSeen()
    expect(seen.at(-1)).toEqual({
      videoId,
      time: 42,
      playing: false,
      rate: 0.75,
      ad: true,
      ended: false
    })
    expect(playingLine(lines, follower.playback)).toBeNull()
    setRate(video, 1)
    video.currentTime = 3
    video.dispatchEvent(new Event('timeupdate'))
    follower.seek(10)
    follower.play()
    follower.setRate(2)
    expect([video.currentTime, video.playbackRate, video.paused]).toEqual([3, 1, true])
    expect(follower.playback).toEqual({
      videoId,
      time: 42,
      playing: false,
      rate: 0.75,
      ad: true,
      ended: false
    })
    player.classList.remove('ad-showing')
    await mutationsSeen()
    expect(video.playbackRate).toBe(0.75)
    expect(follower.playback?.ad).toBe(false)
    expect(playingLine(lines, follower.playback)).toBe(0)
  })

  it("keeps the learner's speed when YouTube loads the video again after an ad", () => {
    const { video } = watchPage()
    const follower = follow()
    follower.setRate(0.75)
    video.dispatchEvent(new Event('loadstart'))
    setRate(video, 1)
    expect(follower.playback?.rate).toBe(0.75)
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(video.playbackRate).toBe(0.75)
    setRate(video, 1.25)
    expect(follower.playback?.rate).toBe(1.25)
  })

  it('takes a speed the learner picks just after a seek as their speed', () => {
    const { video } = watchPage()
    const follower = follow()
    follower.setRate(0.75)
    video.dispatchEvent(new Event('seeking'))
    video.dispatchEvent(new Event('seeked'))
    setRate(video, 1.5)
    expect(video.playbackRate).toBe(1.5)
    expect(follower.playback?.rate).toBe(1.5)
  })

  it("hides YouTube's captions on the player while asked, and gives the player as the caption host", () => {
    const { player } = watchPage()
    const follower = follow()
    const youTubeCaption = player.querySelector('.ytp-caption-window-container')
    expect(follower.captionHost()).toBe(player)
    follower.showSiteCaptions(false)
    expect(player.getAttribute(siteCaptionsAttribute)).toBe('hidden')
    expect(youTubeCaption && getComputedStyle(youTubeCaption).display).toBe('none')
    follower.showSiteCaptions(true)
    expect(player.hasAttribute(siteCaptionsAttribute)).toBe(false)
    follower.showSiteCaptions(false)
    follower.stop()
    expect(player.hasAttribute(siteCaptionsAttribute)).toBe(false)
    expect(document.querySelectorAll('style')).toHaveLength(0)
  })

  it('waits for the player when YouTube has not drawn it yet', async () => {
    const follower = follow()
    follower.showSiteCaptions(false)
    expect(follower.playback).toBeNull()
    expect(follower.captionHost()).toBeNull()
    const { player } = watchPage()
    await mutationsSeen()
    expect(follower.captionHost()).toBe(player)
    expect(follower.playback?.videoId).toBe(videoId)
    expect(player.getAttribute(siteCaptionsAttribute)).toBe('hidden')
  })

  it('runs frame by frame only while the video plays and someone follows it, until stopped', () => {
    const { video } = watchPage()
    const frames = fakeFrames()
    const follower = follow(frames)
    const seen: (Playback | null)[] = []
    const unsubscribe = follower.subscribe(playback => seen.push(playback))
    expect(frames.waiting.size).toBe(0)
    follower.play()
    expect(frames.waiting.size).toBe(1)
    video.currentTime = 1.5
    frames.runFrame()
    expect(seen.at(-1)?.time).toBe(1.5)
    expect(frames.waiting.size).toBe(1)
    follower.pause()
    frames.runFrame()
    expect(frames.waiting.size).toBe(0)
    unsubscribe()
    follower.play()
    expect(frames.waiting.size).toBe(0)
    follower.subscribe(playback => seen.push(playback))
    follower.stop()
    expect(seen.at(-1)).toBeNull()
    expect(frames.waiting.size).toBe(0)
    expect(follower.playback).toBeNull()
  })
})

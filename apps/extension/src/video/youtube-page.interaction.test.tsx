import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  japaneseLines,
  japaneseVideo,
  secondJapaneseVideo
} from '../captions/fixtures/youtube-stand-in'
import { watchedTab } from '../test/watched-tab'
import type { VideoControl } from './controls'
import { youTubeFollower } from './youtube-follower'

const tabId = 5

const minute = 60_000

const watchPageHTML =
  '<div id="movie_player" class="html5-video-player"><video></video><div class="ytp-caption-window-container"></div></div>'

const happyDOM = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM

function navigate(path: string, event: 'yt-navigate-finish' | 'popstate' = 'yt-navigate-finish') {
  history.pushState({}, '', path)
  if (event === 'popstate') window.dispatchEvent(new PopStateEvent('popstate'))
  else document.dispatchEvent(new Event('yt-navigate-finish'))
}

function youTubeTab({ captionsOn = true } = {}) {
  const followers: ReturnType<typeof youTubeFollower>[] = []
  const subscriptions = { open: 0 }
  const watched = watchedTab({
    tabId,
    captionsOn,
    follow: (page, videoId) => {
      const follower = youTubeFollower(page, videoId)
      const subscribe = follower.subscribe
      follower.subscribe = listener => {
        subscriptions.open += 1
        const unsubscribe = subscribe(listener)
        return () => {
          subscriptions.open -= 1
          unsubscribe()
        }
      }
      followers.push(follower)
      return follower
    }
  })
  return {
    ...watched,
    followers,
    subscriptions,
    videoTab: watched.askCaptions,
    control(control: unknown) {
      watched.toContentScript({ target: 'video', control })
    },
    announce(captions: unknown) {
      watched.toContentScript({ target: 'captions', tabId, captions })
    },
    async shown(state: string) {
      await vi.waitFor(async () => {
        const answer = await watched.askCaptions({ type: 'captions', tabId })
        expect('state' in answer && answer.state).toBe(state)
      })
    }
  }
}

const video = () => document.querySelector('video') ?? new HTMLVideoElement()

async function withCaptionsOff() {
  const opened = youTubeTab({ captionsOn: false })
  await vi.advanceTimersByTimeAsync(minute)
  expect(opened.youTube.sent).toEqual([])
  return opened
}

let tab: ReturnType<typeof youTubeTab> | undefined

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  happyDOM.setURL(`https://www.youtube.com/watch?v=${japaneseVideo}`)
  document.body.innerHTML = watchPageHTML
})

afterEach(() => {
  tab?.stop()
  tab = undefined
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('the YouTube watch page', () => {
  it('asks YouTube once on opening a video, and nothing for seeking, line moves, Repeat or speed', async () => {
    tab = youTubeTab()
    await tab.shown('lines')
    const answer = await tab.videoTab({ type: 'captions', tabId })
    expect(
      'state' in answer && answer.state === 'lines' && answer.lines.map(line => line.text)
    ).toEqual(japaneseLines)
    const controls: VideoControl[] = [
      { type: 'play' },
      { type: 'seek', time: 5.4 },
      { type: 'seek', time: 11.2 },
      ...Array.from({ length: 5 }, (): VideoControl => ({ type: 'seek', time: 5.4 })),
      { type: 'rate', rate: 0.75 },
      { type: 'pause' }
    ]
    for (const control of controls) {
      tab.control(control)
      video().dispatchEvent(new Event('timeupdate'))
      await tab.videoTab({ type: 'captions', tabId })
    }
    await vi.advanceTimersByTimeAsync(10 * minute)
    expect([video().currentTime, video().playbackRate, video().paused]).toEqual([5.4, 0.75, true])
    expect(tab.youTube.timedTextRequests()).toBe(1)
  })

  it('asks once more for the next video, and nothing on a page without one or back on the same video', async () => {
    tab = youTubeTab()
    await tab.shown('lines')
    navigate(`/watch?v=${secondJapaneseVideo}`)
    await vi.waitFor(() => expect(tab?.youTube.timedTextRequests()).toBe(2))
    navigate('/results?search_query=japanese')
    expect(await tab.videoTab({ type: 'captions', tabId })).toEqual({ state: 'no-video' })
    navigate(`/watch?v=${japaneseVideo}`, 'popstate')
    await vi.waitFor(() => expect(tab?.youTube.timedTextRequests()).toBe(3))
    navigate('/results?search_query=japanese')
    navigate(`/watch?v=${japaneseVideo}`)
    await tab.shown('lines')
    await vi.advanceTimersByTimeAsync(minute)
    expect(tab.youTube.timedTextRequests()).toBe(3)
  })

  it('after a rate limit, asks again only once the wait is over, and never once the video is closed', async () => {
    tab = youTubeTab()
    tab.youTube.answerTimedText(429)
    await tab.shown('rate-limited')
    await vi.advanceTimersByTimeAsync(15 * minute)
    expect(tab.youTube.timedTextRequests()).toBe(1)
    await vi.advanceTimersByTimeAsync(2.5 * minute)
    expect(tab.youTube.timedTextRequests()).toBe(2)
    expect(await tab.videoTab({ type: 'try-again', tabId })).toMatchObject({ state: 'loading' })
    await vi.waitFor(() => expect(tab?.youTube.timedTextRequests()).toBe(3))
    await tab.shown('rate-limited')
    navigate('/feed/subscriptions')
    await vi.advanceTimersByTimeAsync(3 * 60 * minute)
    expect(tab.youTube.timedTextRequests()).toBe(3)
  })

  it('with Zenbu Captions turned off during a wait, stops asking the service worker once it is over', async () => {
    tab = youTubeTab()
    tab.youTube.answerTimedText(429)
    await vi.waitFor(() => expect(tab?.announced.at(-1)).toBe('rate-limited'))
    tab.settings.captionsOn = false
    const opened = tab.opened.length
    await vi.advanceTimersByTimeAsync(3 * 60 * minute)
    expect(tab.opened.length - opened).toBe(1)
    expect(tab.youTube.timedTextRequests()).toBe(1)
  })

  it('arms no timer for a wait that is already over', async () => {
    tab = await withCaptionsOff()
    const opened = tab.opened.length
    tab.announce({ state: 'rate-limited', videoId: japaneseVideo, retryAt: Date.now() - minute })
    tab.announce({ state: 'rate-limited', videoId: japaneseVideo, retryAt: Date.now() })
    await vi.advanceTimersByTimeAsync(3 * 60 * minute)
    expect(tab.opened.length).toBe(opened)
  })

  it('with Zenbu Captions off, asks nothing until the Video tab asks, then once per video', async () => {
    tab = await withCaptionsOff()
    await tab.videoTab({ type: 'captions', tabId })
    await tab.shown('lines')
    expect(tab.youTube.timedTextRequests()).toBe(1)
    navigate(`/watch?v=${secondJapaneseVideo}`)
    await tab.shown('lines')
    expect(tab.youTube.timedTextRequests()).toBe(2)
  })

  it('follows the video only once a control comes, and stops following on leaving it', async () => {
    tab = youTubeTab()
    tab.control({ type: 'seek', time: -1 })
    tab.control({ type: 'rate', rate: 0 })
    expect(tab.followers).toHaveLength(0)
    tab.control({ type: 'seek', time: 8 })
    expect(tab.followers).toHaveLength(1)
    expect(video().currentTime).toBe(8)
    const [follower] = tab.followers
    navigate('/results?search_query=japanese')
    expect(follower?.playback).toBeNull()
    tab.control({ type: 'play' })
    expect(tab.followers).toHaveLength(1)
  })
})

describe('the playback it sends a Video tab', () => {
  const sent = () => tab?.ports.posted.length ?? 0

  it('sends nothing until a Video tab opens for it, and nothing once that tab closes', async () => {
    tab = youTubeTab()
    video().dispatchEvent(new Event('seeked'))
    expect(tab.followers).toHaveLength(0)
    const heard: unknown[] = []
    const panel = tab.ports.connect(tabId)
    panel.onMessage.addListener(message => heard.push(message))
    await vi.waitFor(() => expect(heard).toHaveLength(1))
    expect(heard[0]).toEqual({
      target: 'video-tab',
      playback: { videoId: japaneseVideo, time: 0, playing: false, rate: 1, ad: false }
    })
    tab.control({ type: 'seek', time: 5.4 })
    video().dispatchEvent(new Event('seeked'))
    await vi.waitFor(() => expect(heard.at(-1)).toMatchObject({ playback: { time: 5.4 } }))
    expect(tab.subscriptions.open).toBe(1)
    panel.disconnect()
    await Promise.resolve()
    expect(tab.subscriptions.open).toBe(0)
    const before = sent()
    video().dispatchEvent(new Event('seeked'))
    video().dispatchEvent(new Event('timeupdate'))
    expect(sent()).toBe(before)
  })

  it('tells an open Video tab when the page leaves the video and opens the next one', async () => {
    tab = youTubeTab()
    const heard: unknown[] = []
    tab.ports.connect(tabId).onMessage.addListener(message => heard.push(message))
    await vi.waitFor(() => expect(heard).toHaveLength(1))
    navigate('/results?search_query=japanese')
    await vi.waitFor(() => expect(heard.at(-1)).toEqual({ target: 'video-tab', playback: null }))
    navigate(`/watch?v=${secondJapaneseVideo}`)
    await vi.waitFor(() =>
      expect(heard.at(-1)).toMatchObject({ playback: { videoId: secondJapaneseVideo } })
    )
  })

  it('answers no other port', async () => {
    tab = youTubeTab()
    const heard: unknown[] = []
    tab.ports.connect(tabId, 'another').onMessage.addListener(message => heard.push(message))
    await vi.advanceTimersByTimeAsync(minute)
    expect(heard).toEqual([])
    expect(tab.followers).toHaveLength(0)
  })
})

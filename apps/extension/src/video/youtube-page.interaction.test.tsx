import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captionsService } from '../captions/captions-service'
import { memoryStorage } from '../captions/fixtures/memory-storage'
import {
  japaneseLines,
  japaneseVideo,
  secondJapaneseVideo,
  youTubeStandIn
} from '../captions/fixtures/youtube-stand-in'
import {
  askCaptions,
  type CaptionsAnswer,
  type CaptionsEnvelope,
  type CaptionsRequest
} from '../captions/messages'
import { answerCaptions } from '../captions/serve-captions'
import type { VideoControl } from './controls'
import { watchedVideoId } from './watch-page'
import { youTubeFollower } from './youtube-follower'
import { followYouTubePage } from './youtube-page'

const tabId = 5

const minute = 60_000

const watchPageHTML =
  '<div id="movie_player" class="html5-video-player"><video></video><div class="ytp-caption-window-container"></div></div>'

type ContentListener = (message: unknown) => false

const happyDOM = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM

function navigate(path: string, event: 'yt-navigate-finish' | 'popstate' = 'yt-navigate-finish') {
  history.pushState({}, '', path)
  if (event === 'popstate') window.dispatchEvent(new PopStateEvent('popstate'))
  else document.dispatchEvent(new Event('yt-navigate-finish'))
}

function youTubeTab({ captionsOn = true } = {}) {
  const youTube = youTubeStandIn()
  const contentScript = new Set<ContentListener>()
  const settings = { captionsOn }
  const followers: ReturnType<typeof youTubeFollower>[] = []
  const serviceWorker = answerCaptions(
    captionsService({
      storage: memoryStorage(),
      fetch: youTube.fetch,
      tabVideo: async () => watchedVideoId(location.href),
      captionsOn: async () => settings.captionsOn,
      announce: change => {
        for (const listener of contentScript) listener(change)
      },
      now: () => Date.now(),
      random: () => 0.5
    })
  )
  const sendFrom =
    (sender: { tab?: { id?: number } }) =>
    (message: CaptionsEnvelope): Promise<CaptionsAnswer> =>
      new Promise(resolve => serviceWorker(message, sender, resolve))
  const stop = followYouTubePage(document, {
    runtime: {
      sendMessage: sendFrom({ tab: { id: tabId } }),
      onMessage: {
        addListener: listener => contentScript.add(listener),
        removeListener: listener => contentScript.delete(listener)
      }
    },
    follow: (page, videoId) => {
      const follower = youTubeFollower(page, videoId)
      followers.push(follower)
      return follower
    }
  })
  const sidePanel = { sendMessage: sendFrom({}) }
  return {
    youTube,
    settings,
    followers,
    stop,
    videoTab: (request: CaptionsRequest) => askCaptions(request, sidePanel),
    control(control: unknown) {
      for (const listener of contentScript) listener({ target: 'video', control })
    },
    async shown(state: string) {
      await vi.waitFor(async () => {
        const answer = await askCaptions({ type: 'captions', tabId }, sidePanel)
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

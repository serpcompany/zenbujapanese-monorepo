import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  englishVideo,
  japaneseLines,
  japaneseVideo,
  secondJapaneseVideo
} from '../captions/fixtures/youtube-stand-in'
import {
  playerCaptions,
  playerCaptionsAttribute,
  type ShowCaptions
} from '../player-captions/player-captions'
import { type Settings, settingDefaults } from '../shared/settings'
import '../test/act-environment'
import { type ClockFollower, clockFollower } from '../test/clock-follower'
import { captionServices, standInFonts } from '../test/player-on'
import { lineText } from '../test/video-tab-harness'
import { watchedTab } from '../test/watched-tab'
import type { PlayerCaptions } from './youtube-page'

const tabId = 5

const happyDOM = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM

type Shown = {
  videoId: string
  lines: readonly Caption[]
  settings: Settings
  changes: Settings[]
  seeks: number[]
  stopped: boolean
}

function recordedCaptions() {
  const shows: Shown[] = []
  const show: ShowCaptions = (_follower, video, settings) => {
    const shown: Shown = {
      videoId: video.videoId,
      lines: video.lines,
      settings,
      changes: [],
      seeks: [],
      stopped: false
    }
    shows.push(shown)
    return {
      settingsChanged: next => void shown.changes.push(next),
      seek: time => void shown.seeks.push(time),
      stop: () => {
        shown.stopped = true
      }
    }
  }
  return { show, shows }
}

function pageSettings(initial: Partial<Settings>) {
  let current: Settings = { ...settingDefaults, ...initial }
  const listeners = new Set<(settings: Settings) => void>()
  const settings: PlayerCaptions['settings'] = {
    ask: async () => current,
    onChanged(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  }
  return {
    settings,
    listening: () => listeners.size,
    change(next: Partial<Settings>) {
      current = { ...current, ...next }
      for (const listener of [...listeners]) listener(current)
    }
  }
}

function captionedTab({
  settings = {},
  show
}: {
  settings?: Partial<Settings>
  show?: ShowCaptions
} = {}) {
  const player = document.body.appendChild(document.createElement('div'))
  player.id = 'movie_player'
  const clocks: ClockFollower[] = []
  const recorded = recordedCaptions()
  const page = pageSettings(settings)
  const tab = watchedTab({
    tabId,
    captionsOn: settings['videos.zenbuCaptions'] ?? true,
    follow: (_page, videoId) => {
      const clock = clockFollower({ videoId, host: player })
      clocks.push(clock)
      return clock.follower
    },
    captions: { settings: page.settings, show: show ?? recorded.show }
  })
  return {
    ...tab,
    ...recorded,
    page,
    player,
    clocks,
    control(control: unknown) {
      tab.toContentScript({ target: 'video', control })
    }
  }
}

let tab: ReturnType<typeof captionedTab> | undefined

const opened = async (options?: Parameters<typeof captionedTab>[0]) => {
  tab = captionedTab(options)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  return tab
}

const settled = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
  })
  happyDOM.setURL(`https://www.youtube.com/watch?v=${japaneseVideo}`)
})

afterEach(() => {
  act(() => tab?.stop())
  tab = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

const texts = (lines: readonly Caption[] | undefined) => lines?.map(line => line.text)

describe('Zenbu’s caption on a YouTube watch page', () => {
  it('shows the video’s lines in place of the site’s captions, asking YouTube once', async () => {
    const watched = await opened()
    expect(watched.shows).toHaveLength(1)
    expect(watched.shows[0].videoId).toBe(japaneseVideo)
    expect(texts(watched.shows[0].lines)).toEqual(japaneseLines)
    expect(watched.clocks[0].siteCaptions).toEqual([false])
    expect(watched.youTube.timedTextRequests()).toBe(1)
  })

  it('with Zenbu Captions off, shows none and leaves the site’s captions', async () => {
    const watched = await opened({ settings: { 'videos.zenbuCaptions': false } })
    expect(watched.youTube.timedTextRequests()).toBe(0)
    expect(watched.shows).toEqual([])
    expect(watched.clocks).toEqual([])
  })

  it('takes the caption away when Zenbu Captions turns off, and brings it back with no new request', async () => {
    const watched = await opened()
    act(() => watched.page.change({ 'videos.zenbuCaptions': false }))
    expect(watched.shows[0].stopped).toBe(true)
    expect(watched.clocks[0].siteCaptions).toEqual([false, true])
    expect(watched.clocks[0].follower.playback).toBeNull()
    act(() => watched.page.change({ 'videos.zenbuCaptions': true }))
    expect(watched.shows).toHaveLength(2)
    expect(texts(watched.shows[1].lines)).toEqual(japaneseLines)
    expect(watched.clocks[1].siteCaptions).toEqual([false])
    expect(watched.youTube.timedTextRequests()).toBe(1)
  })

  it('keeps the caption, and the site’s captions hidden, when Page Text turns off', async () => {
    const watched = await opened()
    act(() => watched.page.change({ 'pages.pageText': false }))
    expect(watched.shows).toHaveLength(1)
    expect(watched.shows[0].stopped).toBe(false)
    expect(watched.clocks[0].siteCaptions).toEqual([false])
  })

  it('takes the caption away when Zenbu turns off for the site, giving YouTube its captions back', async () => {
    const watched = await opened()
    act(() => watched.page.change({ 'sites.off': ['www.youtube.com'] }))
    expect(watched.shows[0].stopped).toBe(true)
    expect(watched.clocks[0].siteCaptions).toEqual([false, true])
    act(() => watched.page.change({ 'sites.off': [] }))
    expect(watched.shows).toHaveLength(2)
  })

  it('shows none on a watch page of a site Zenbu is off for', async () => {
    const watched = await opened({ settings: { 'sites.off': ['www.youtube.com'] } })
    expect(watched.shows).toEqual([])
  })

  it('passes each settings change to the caption', async () => {
    const watched = await opened()
    act(() => watched.page.change({ 'readingAids.romaji': true }))
    expect(watched.shows[0].changes.at(-1)?.['readingAids.romaji']).toBe(true)
  })

  it('sends the Video tab’s seeks through the caption, and its other controls to the video', async () => {
    const watched = await opened()
    watched.control({ type: 'seek', time: 5.4 })
    watched.control({ type: 'rate', rate: 1.25 })
    await settled()
    expect(watched.shows[0].seeks).toEqual([5.4])
    expect(watched.clocks[0].seeks).toEqual([])
    expect(watched.clocks[0].rates).toEqual([1.25])
  })

  it('keeps following the video for the caption after the Video tab closes', async () => {
    const watched = await opened()
    const panel = watched.ports.connect(tabId)
    await settled()
    panel.disconnect()
    await settled()
    expect(watched.clocks).toHaveLength(1)
    expect(watched.clocks[0].follower.playback).not.toBeNull()
    expect(watched.shows[0].stopped).toBe(false)
  })

  it('moves to the next video’s lines when the learner opens another video', async () => {
    const watched = await opened()
    history.pushState({}, '', `/watch?v=${secondJapaneseVideo}`)
    document.dispatchEvent(new Event('yt-navigate-finish'))
    await settled()
    expect(watched.shows[0].stopped).toBe(true)
    expect(watched.shows).toHaveLength(2)
    expect(watched.shows[1].videoId).toBe(secondJapaneseVideo)
    expect(watched.youTube.timedTextRequests()).toBe(2)
  })

  it('draws nothing over the next video before the page says it opened, and leaves it alone', async () => {
    standInFonts()
    const watched = await opened({
      show: playerCaptions({ services: captionServices().services })
    })
    const [clock] = watched.clocks
    const caption = () =>
      watched.player
        .querySelector(`[${playerCaptionsAttribute}]`)
        ?.shadowRoot?.querySelector('[data-player-caption]') ?? null
    clock.learnerSeeks(0.6)
    clock.learnerPlays()
    await settled()
    expect(caption()).not.toBeNull()
    clock.videoChanges(secondJapaneseVideo)
    clock.learnerSeeks(0.6)
    await settled()
    expect(caption()).toBeNull()
    watched.control({ type: 'seek', time: 2 })
    await settled()
    expect(clock.seeks).toEqual([])
  })

  it('shows nothing for a video without Japanese captions', async () => {
    happyDOM.setURL(`https://www.youtube.com/watch?v=${englishVideo}`)
    const watched = await opened()
    expect(watched.shows).toEqual([])
    expect(watched.clocks).toEqual([])
  })

  it('stops listening for settings when the page script stops', async () => {
    const watched = await opened()
    expect(watched.page.listening()).toBe(1)
    act(() => watched.stop())
    expect(watched.page.listening()).toBe(0)
    expect(watched.shows[0].stopped).toBe(true)
  })

  it('draws the line being heard inside the player', async () => {
    standInFonts()
    const watched = await opened({
      show: playerCaptions({ services: captionServices().services })
    })
    watched.clocks[0].learnerSeeks(0.6)
    watched.clocks[0].learnerPlays()
    await settled()
    const host = watched.player.querySelector(`[${playerCaptionsAttribute}]`)
    expect(lineText(host?.shadowRoot?.querySelector('[data-player-caption]'))).toBe(
      japaneseLines[0]
    )
  })
})

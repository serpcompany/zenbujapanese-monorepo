import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  englishTrack,
  japaneseTrack,
  netflixEnglish,
  netflixLines,
  netflixVideo
} from '../captions/fixtures/netflix-stand-in'
import { playerCaptions, playerCaptionsAttribute } from '../player-captions/player-captions'
import '../test/act-environment'
import { netflixPlayerStandIn, standInTracks } from '../test/netflix-player-stand-in'
import { pageSettings } from '../test/page-settings'
import { captionServices, standInFonts } from '../test/player-on'
import { lineText } from '../test/video-tab-harness'
import { watchedTab } from '../test/watched-tab'
import { type NetflixWindow, serveNetflixPlayer } from './netflix-player'
import { netflixPage } from './video-sites'

const tabId = 7

const secondVideo = '70000002'

const view = window as NetflixWindow & { navigation?: EventTarget }

const happyDOM = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM

const quick = { step: 1, player: 50, track: 50 }

const stops: (() => void)[] = []

const settled = () =>
  act(async () => {
    await new Promise(resolve => setTimeout(resolve, 5))
  })

async function netflixTab(settings = { 'videos.zenbuCaptions': true }) {
  standInFonts()
  view.navigation = new EventTarget()
  const standIn = netflixPlayerStandIn(view, {
    videoId: netflixVideo,
    loaded: ['T:en'],
    showing: standInTracks.english
  })
  const page = pageSettings(settings)
  const { services } = captionServices()
  stops.push(serveNetflixPlayer(view, quick), standIn.remove)
  const tab = watchedTab({
    tabId,
    captionsOn: settings['videos.zenbuCaptions'],
    site: netflixPage(document),
    captions: { settings: page.settings, show: playerCaptions({ services }) }
  })
  stops.push(() => act(() => tab.stop()))
  await vi.waitFor(async () => {
    const answer = await tab.askCaptions({ type: 'captions', tabId })
    expect('state' in answer && answer.state).toBe('lines')
  })
  await settled()
  const player = document.querySelector<HTMLElement>('.watch-video--player-view')
  const caption = () =>
    player
      ?.querySelector(`[${playerCaptionsAttribute}]`)
      ?.shadowRoot?.querySelector('[data-player-caption]') ?? null
  return { tab, standIn, page, player, caption, services }
}

function navigate(path: string) {
  happyDOM.setURL(`https://www.netflix.com${path}`)
  view.navigation?.dispatchEvent(new Event('currententrychange'))
}

beforeEach(() => {
  happyDOM.setURL(`https://www.netflix.com/watch/${netflixVideo}?trackId=1`)
})

afterEach(() => {
  for (const stop of stops.splice(0).reverse()) stop()
  delete view.navigation
  vi.unstubAllGlobals()
  document.head.replaceChildren()
  document.body.replaceChildren()
})

describe('a Netflix watch page', () => {
  it("reads the tracks from Netflix's player, putting the learner's track back, and fetches each file once", async () => {
    const { tab, standIn } = await netflixTab()
    expect(standIn.calls).toEqual(['show T:ja', 'show T:en'])
    expect(standIn.showing()).toBe(standInTracks.english)
    expect(tab.netflix.urls()).toEqual([japaneseTrack, englishTrack])
    const answer = await tab.askCaptions({ type: 'captions', tabId })
    expect(answer).toMatchObject({ state: 'lines', videoId: netflixVideo })
    const lines = 'lines' in answer ? answer.lines : []
    expect(lines.map(line => line.text)).toEqual(netflixLines)
    expect(lines.map(line => line.translation)).toEqual(netflixEnglish)
  })

  it("draws the line on Netflix's player with Netflix's English, hiding Netflix's subtitles while Zenbu Captions is on", async () => {
    const { standIn, player, page, caption, services } = await netflixTab()
    standIn.setTime(4)
    standIn.video.dispatchEvent(new Event('timeupdate'))
    await settled()
    expect(lineText(caption())).toBe(netflixLines[0])
    expect(caption()?.querySelector('[data-aid="translation"]')?.textContent).toBe(
      netflixEnglish[0]
    )
    expect(services.translate).not.toHaveBeenCalledWith(
      expect.objectContaining({ texts: [netflixLines[0]] })
    )
    const subtitles = document.querySelector<HTMLElement>('.player-timedtext')
    expect(subtitles && getComputedStyle(subtitles).display).toBe('none')
    page.change({ 'videos.zenbuCaptions': false })
    await settled()
    expect(caption()).toBeNull()
    expect(player?.hasAttribute('data-zenbu-site-captions')).toBe(false)
    expect(subtitles && getComputedStyle(subtitles).display).not.toBe('none')
  })

  it("seeks, plays, and sets the speed from the Video tab through Netflix's player, never the video's currentTime", async () => {
    const { tab, standIn } = await netflixTab({ 'videos.zenbuCaptions': false })
    standIn.calls.length = 0
    tab.toContentScript({ target: 'video', control: { type: 'rate', rate: 0.75 } })
    tab.toContentScript({ target: 'video', control: { type: 'seek', time: 9 } })
    tab.toContentScript({ target: 'video', control: { type: 'play' } })
    await settled()
    expect(standIn.calls).toEqual(['rate 0.75', 'seek 9000', 'play'])
    expect(standIn.video.playbackRate).toBe(0.75)
  })

  it('asks for the next video when Netflix moves to it, and for none away from a watch page', async () => {
    const { tab } = await netflixTab()
    navigate(`/watch/${secondVideo}`)
    await vi.waitFor(() => expect(tab.opened).toEqual([netflixVideo, secondVideo]))
    navigate('/browse')
    expect(await tab.askCaptions({ type: 'captions', tabId })).toEqual({ state: 'no-video' })
  })
})

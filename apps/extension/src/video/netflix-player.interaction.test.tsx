import { afterEach, describe, expect, it } from 'vitest'
import { trackURL } from '../captions/fixtures/netflix-stand-in'
import { noPlayer } from '../captions/messages'
import { netflixPlayerStandIn, standInTracks } from '../test/netflix-player-stand-in'
import { netflixBridge } from './netflix-bridge'
import { chosenTrack, type NetflixWindow, serveNetflixPlayer } from './netflix-player'

const videoId = '81234567'

const view = window as NetflixWindow

const quick = { step: 1, player: 20, track: 20 }

const stops: (() => void)[] = []

function served(options: Omit<Parameters<typeof netflixPlayerStandIn>[1], 'videoId'> = {}) {
  const standIn = netflixPlayerStandIn(view, { videoId, ...options })
  stops.push(serveNetflixPlayer(view, quick), standIn.remove)
  return { standIn, bridge: netflixBridge(document, 1_000) }
}

afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  document.body.innerHTML = ''
})

describe('chosenTrack', () => {
  const { off, japanese, japaneseCC, japaneseForced, japaneseImages, english, french } =
    standInTracks

  it('takes text subtitles before closed captions, in the language or one of its regions', () => {
    expect(chosenTrack([off, japaneseCC, japanese, english], 'ja')).toBe(japanese)
    expect(chosenTrack([japaneseCC, english], 'ja')).toBe(japaneseCC)
    expect(chosenTrack([off, japanese, english], 'en')).toBe(english)
    expect(chosenTrack([{ trackId: 'T:jv', bcp47: 'jv' }], 'ja')).toBeNull()
  })

  it('never takes the off track, forced narrative, or subtitles drawn as images', () => {
    expect(chosenTrack([off, japaneseForced, japaneseImages, french], 'ja')).toBeNull()
    expect(chosenTrack([{ ...off, bcp47: 'ja' }], 'ja')).toBeNull()
  })
})

describe('serveNetflixPlayer', () => {
  async function bothTracks(loaded: string[], state?: Record<string, unknown>) {
    const { standIn, bridge } = served({ loaded, showing: standInTracks.english, state })
    await expect(bridge.tracks(videoId)).resolves.toEqual({
      state: 'tracks',
      japanese: trackURL('T:ja'),
      english: trackURL('T:en')
    })
    expect(standIn.showing()).toBe(standInTracks.english)
    return standIn.calls
  }

  it("gives the tracks Netflix has loaded and leaves the learner's track alone", async () => {
    expect(await bothTracks(['T:ja', 'T:en'])).toEqual([])
  })

  it("loads only the tracks Netflix hasn't, then puts back the learner's track", async () => {
    expect(await bothTracks(['T:en'])).toEqual(['show T:ja', 'show T:en'])
  })

  it('turns captions back off after loading them for a learner who had them off', async () => {
    const { standIn, bridge } = served({ tracks: [standInTracks.off, standInTracks.japanese] })
    await expect(bridge.tracks(videoId)).resolves.toEqual({
      state: 'tracks',
      japanese: trackURL('T:ja'),
      english: null
    })
    expect(standIn.calls).toEqual(['show T:ja', 'show T:off'])
  })

  it('turns captions back off for a learner Netflix shows no track for, once it lists its off track', async () => {
    const { standIn, bridge } = served({
      tracks: [standInTracks.japanese],
      showing: null,
      listsOffOnceShown: true
    })
    await expect(bridge.tracks(videoId)).resolves.toEqual({
      state: 'tracks',
      japanese: trackURL('T:ja'),
      english: null
    })
    expect(standIn.calls).toEqual(['show T:ja', 'show T:off'])
  })

  it("reads only Netflix's own data, never a getter, and looks first where it last found a track", async () => {
    let gotten = 0
    let listed = 0
    const lazy = {
      get value() {
        gotten += 1
        return {}
      }
    }
    const wide = new Proxy(
      { a: 1 },
      {
        ownKeys(target) {
          listed += 1
          return Reflect.ownKeys(target)
        }
      }
    )
    await bothTracks(['T:ja', 'T:en'], { lazy, wide })
    expect(gotten).toBe(0)
    expect(listed).toBe(1)
  })

  it('says when the video has no Japanese text subtitles, or when no player is there', async () => {
    const { standIn, bridge } = served({
      tracks: [standInTracks.off, standInTracks.japaneseImages, standInTracks.english]
    })
    await expect(bridge.tracks(videoId)).resolves.toEqual({ state: 'no-japanese-captions' })
    expect(standIn.calls).toEqual([])
    standIn.remove()
    await expect(bridge.tracks(videoId)).resolves.toEqual(noPlayer)
  })

  it("drives Netflix's player, never the video's currentTime", () => {
    const { standIn, bridge } = served()
    bridge.control(videoId, { type: 'seek', time: 30.25 })
    bridge.control(videoId, { type: 'play' })
    bridge.control(videoId, { type: 'rate', rate: 0.75 })
    bridge.control(videoId, { type: 'pause' })
    bridge.control('70000001', { type: 'play' })
    expect(standIn.calls).toEqual(['seek 30250', 'play', 'rate 0.75', 'pause'])
    expect(standIn.video.playbackRate).toBe(0.75)
  })

  it("sets the video's speed when Netflix's player has no speed of its own", () => {
    const { standIn, bridge } = served({ ownRate: false })
    bridge.control(videoId, { type: 'rate', rate: 1.25 })
    expect(standIn.calls).toEqual([])
    expect(standIn.video.playbackRate).toBe(1.25)
  })
})

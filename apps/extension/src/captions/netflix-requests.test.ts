import { describe, expect, it } from 'vitest'
import {
  englishTrack,
  japaneseTrack,
  netflixEnglish,
  netflixLines,
  netflixStandIn,
  netflixTracks
} from './fixtures/netflix-stand-in'
import { captionLabels } from './labels'
import type { CaptionTracks } from './messages'
import { fetchNetflixCaptions } from './netflix-requests'
import { requestTimeout } from './youtube-requests'

const fetched = (tracks: CaptionTracks | Promise<CaptionTracks>, netflix = netflixStandIn()) =>
  fetchNetflixCaptions(Promise.resolve(tracks), netflix.fetch)

const failed = (reason: string) => ({ state: 'failed', reason })

describe('fetchNetflixCaptions', () => {
  it("fetches the Japanese and English tracks once, without cookies, and pairs Netflix's English with the lines", async () => {
    const netflix = netflixStandIn()
    const captions = await fetched(netflixTracks, netflix)
    expect(netflix.urls()).toEqual([japaneseTrack, englishTrack])
    for (const { init } of netflix.sent) {
      expect(init?.credentials).toBe('omit')
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
    if (captions.state !== 'lines') throw new Error(`expected lines, got ${captions.state}`)
    expect(captions.lines.map(line => line.text)).toEqual(netflixLines)
    expect(captions.lines.map(line => line.translation)).toEqual(netflixEnglish)
    expect(captions.lines[0]).toMatchObject({ id: 0, start: 3.5, end: 5.25 })
    expect(requestTimeout).toBe(15_000)
  })

  it('gives the lines without English when the video has no English track or it fails', async () => {
    const without = await fetched({ ...netflixTracks, english: null })
    const netflix = netflixStandIn()
    netflix.refuse(englishTrack, 403)
    const refused = await fetched(netflixTracks, netflix)
    for (const captions of [without, refused]) {
      if (captions.state !== 'lines') throw new Error(`expected lines, got ${captions.state}`)
      expect(captions.lines.map(line => [line.text, line.translation])).toEqual(
        netflixLines.map(text => [text, null])
      )
    }
  })

  it('gives No Japanese Captions, or why there are none, without asking a host it does not trust', async () => {
    const netflix = netflixStandIn()
    expect(await fetched({ state: 'no-japanese-captions' }, netflix)).toEqual({
      state: 'no-japanese-captions'
    })
    expect(await fetched({ state: 'no-player' }, netflix)).toEqual(
      failed(captionLabels.netflix.unavailable)
    )
    expect(await fetched(Promise.reject(new Error('gone')), netflix)).toEqual(
      failed(captionLabels.netflix.unavailable)
    )
    const elsewhere = { ...netflixTracks, japanese: 'https://www.example.com/ja.xml' }
    expect(await fetched(elsewhere, netflix)).toEqual(failed(captionLabels.failed.unreadable))
    expect(netflix.sent).toEqual([])
  })

  it("names Netflix when it refuses the track or can't be reached, and reads no file that isn't TTML", async () => {
    const netflix = netflixStandIn()
    netflix.refuse(japaneseTrack, 403)
    expect(await fetched(netflixTracks, netflix)).toEqual(failed(captionLabels.netflix.refused))
    const unknown = { ...netflixTracks, japanese: `${japaneseTrack}&missing` }
    expect(await fetched(unknown)).toEqual(failed(captionLabels.netflix.unreachable))
    const other = netflixStandIn()
    other.serve(japaneseTrack, '<transcript><text start="1">要求</text></transcript>')
    expect(await fetched(netflixTracks, other)).toEqual(failed(captionLabels.failed.unreadable))
  })
})

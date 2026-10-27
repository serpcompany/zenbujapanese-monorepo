import { describe, expect, it } from 'vitest'
import {
  englishVideo,
  japaneseLines,
  japaneseVideo,
  playerURL,
  timedTextURL,
  unplayableVideo,
  youTubeStandIn
} from './fixtures/youtube-stand-in'
import { captionLabels } from './labels'
import { fetchYouTubeCaptions } from './youtube-requests'

describe('fetchYouTubeCaptions', () => {
  it("asks for the player as YouTube's Android app, then the Japanese track without a translation", async () => {
    const youTube = youTubeStandIn()
    const fetched = await fetchYouTubeCaptions(japaneseVideo, youTube.fetch)
    expect(youTube.sent.map(request => request.url)).toEqual([
      playerURL,
      timedTextURL(japaneseVideo)
    ])
    const [player, timedText] = youTube.sent
    expect(player?.init?.method).toBe('POST')
    expect(player?.init?.credentials).toBe('omit')
    expect(JSON.parse(String(player?.init?.body))).toEqual({
      context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' } },
      videoId: japaneseVideo
    })
    expect(timedText?.init?.credentials).toBe('omit')
    expect(fetched.state).toBe('lines')
  })

  it("gives a video's lines through the core's rules, without sound tags or empty lines", async () => {
    const fetched = await fetchYouTubeCaptions(japaneseVideo, youTubeStandIn().fetch)
    if (fetched.state !== 'lines') throw new Error(`expected lines, got ${fetched.state}`)
    expect(fetched.lines.map(line => line.text)).toEqual(japaneseLines)
    expect(fetched.lines.map(line => [line.id, line.start, line.translation])).toEqual([
      [0, 0.5, null],
      [1, 5.4, null],
      [2, 11.2, null]
    ])
  })

  it('gives No Japanese Captions for a video with no Japanese track, without asking for one', async () => {
    const youTube = youTubeStandIn()
    expect(await fetchYouTubeCaptions(englishVideo, youTube.fetch)).toEqual({
      state: 'no-japanese-captions'
    })
    expect(youTube.timedTextRequests()).toBe(0)
  })

  it('gives No Japanese Captions for a Japanese track with no spoken line', async () => {
    const youTube = youTubeStandIn()
    youTube.answerTimedText(200, '<transcript><text start="1" dur="2">[音楽]</text></transcript>')
    expect(await fetchYouTubeCaptions(japaneseVideo, youTube.fetch)).toEqual({
      state: 'no-japanese-captions'
    })
  })

  it('tells a rate limit apart from other refusals', async () => {
    const youTube = youTubeStandIn()
    youTube.answerTimedText(429)
    expect(await fetchYouTubeCaptions(japaneseVideo, youTube.fetch)).toEqual({
      state: 'rate-limited'
    })
    youTube.answerTimedText(403)
    expect(await fetchYouTubeCaptions(japaneseVideo, youTube.fetch)).toEqual({
      state: 'failed',
      reason: captionLabels.failed.refused
    })
    const limitedPlayer = async () => new Response('', { status: 429 })
    expect(await fetchYouTubeCaptions(japaneseVideo, limitedPlayer)).toEqual({
      state: 'rate-limited'
    })
  })

  it('fails with a reason when the video, the network, or the captions let it down', async () => {
    expect(await fetchYouTubeCaptions(unplayableVideo, youTubeStandIn().fetch)).toEqual({
      state: 'failed',
      reason: captionLabels.failed.unavailable
    })
    const offline = async (): Promise<Response> => {
      throw new TypeError('Failed to fetch')
    }
    expect(await fetchYouTubeCaptions(japaneseVideo, offline)).toEqual({
      state: 'failed',
      reason: captionLabels.failed.unreachable
    })
    const youTube = youTubeStandIn()
    youTube.answerTimedText(200, '<transcript><text start="1">&#1;</text></transcript>')
    expect(await fetchYouTubeCaptions(japaneseVideo, youTube.fetch)).toEqual({
      state: 'failed',
      reason: captionLabels.failed.unreadable
    })
  })

  it('never follows a track to a host other than YouTube', async () => {
    const elsewhere = youTubeStandIn()
    const player = JSON.stringify({
      playabilityStatus: { status: 'OK' },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{ baseUrl: 'https://example.com/api/timedtext?v=x', languageCode: 'ja' }]
        }
      }
    })
    const fetch = async (url: string, init?: RequestInit) =>
      url === playerURL ? new Response(player) : elsewhere.fetch(url, init)
    expect(await fetchYouTubeCaptions(japaneseVideo, fetch)).toEqual({
      state: 'failed',
      reason: captionLabels.failed.unreadable
    })
    expect(elsewhere.sent).toEqual([])
  })
})

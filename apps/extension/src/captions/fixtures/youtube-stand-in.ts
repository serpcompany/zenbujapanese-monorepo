import type { Fetch } from '../youtube-requests'
import englishPlayer from './player-english.json?raw'
import japanesePlayer from './player-japanese.json?raw'
import japaneseTimedText from './timedtext-japanese.xml?raw'

export const japaneseVideo = 'zenbuJa0001'
export const secondJapaneseVideo = 'zenbuJa0002'
export const englishVideo = 'zenbuEn0001'
export const unplayableVideo = 'zenbuNo0001'

export const playerURL = 'https://www.youtube.com/youtubei/v1/player'
export const timedTextURL = (videoId: string) =>
  `https://www.youtube.com/api/timedtext?v=${videoId}&lang=ja`

export const japaneseLines = ['おはようございます', '今日は"いい天気"ですね', '散歩に行きましょう']

type Sent = { url: string; init?: RequestInit }

const unplayable = JSON.stringify({ playabilityStatus: { status: 'ERROR' } })

function playerFor(init: RequestInit | undefined): string {
  const { videoId } = JSON.parse(String(init?.body)) as { videoId: string }
  if (videoId === englishVideo) return englishPlayer
  if (videoId === unplayableVideo) return unplayable
  return japanesePlayer.replaceAll(japaneseVideo, videoId)
}

const untilAborted = (signal: AbortSignal | null | undefined) =>
  new Promise<Response>((_, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason))
  })

export function youTubeStandIn() {
  const sent: Sent[] = []
  let timedTextStatus = 200
  let timedTextBody = japaneseTimedText
  let timedTextHangs = false
  const fetch: Fetch = async (url, init) => {
    sent.push({ url, init })
    if (url === playerURL) return new Response(playerFor(init))
    if (timedTextHangs) return untilAborted(init?.signal)
    return new Response(timedTextBody, { status: timedTextStatus })
  }
  return {
    fetch,
    sent,
    timedTextRequests: () => sent.filter(request => request.url !== playerURL).length,
    answerTimedText(status: number, body = japaneseTimedText) {
      timedTextHangs = false
      timedTextStatus = status
      timedTextBody = body
    },
    hangTimedText() {
      timedTextHangs = true
    }
  }
}

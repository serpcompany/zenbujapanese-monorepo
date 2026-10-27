import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { youTubeCaptions, youTubeVideo } from '@zenbu/dictionary-core/captions/youtube'
import { captionLabels } from './labels'

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export type Fetched =
  | { state: 'lines'; lines: Caption[] }
  | { state: 'no-japanese-captions' }
  | { state: 'rate-limited' }
  | { state: 'failed'; reason: string }

const youTubeOrigin = 'https://www.youtube.com'

export const youTubeiURL = `${youTubeOrigin}/youtubei/`

const playerURL = `${youTubeiURL}v1/player`

const androidClient = { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' }

const tooManyRequests = 429

const failed = (reason: string): Fetched => ({ state: 'failed', reason })

function timedTextURL(trackURL: string): string | null {
  if (!URL.canParse(trackURL)) return null
  const url = new URL(trackURL)
  if (url.origin !== youTubeOrigin) return null
  url.searchParams.delete('fmt')
  url.searchParams.delete('tlang')
  return url.href
}

async function playerResponse(videoId: string, fetch: Fetch): Promise<Response> {
  return fetch(playerURL, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: androidClient }, videoId })
  })
}

async function captionsOf(videoId: string, fetch: Fetch): Promise<Fetched> {
  const player = await playerResponse(videoId, fetch)
  if (player.status === tooManyRequests) return { state: 'rate-limited' }
  const video = player.ok ? youTubeVideo(await player.text()) : null
  if (!video?.playable) return failed(captionLabels.failed.unavailable)
  if (!video.track) return { state: 'no-japanese-captions' }
  const url = timedTextURL(video.track.url)
  if (!url) return failed(captionLabels.failed.unreadable)
  const timedText = await fetch(url, { credentials: 'omit' })
  if (timedText.status === tooManyRequests) return { state: 'rate-limited' }
  if (!timedText.ok) return failed(captionLabels.failed.refused)
  const lines = youTubeCaptions(await timedText.text())
  if (!lines) return failed(captionLabels.failed.unreadable)
  return lines.length > 0 ? { state: 'lines', lines } : { state: 'no-japanese-captions' }
}

export function fetchYouTubeCaptions(videoId: string, fetch: Fetch): Promise<Fetched> {
  return captionsOf(videoId, fetch).catch(() => failed(captionLabels.failed.unreachable))
}

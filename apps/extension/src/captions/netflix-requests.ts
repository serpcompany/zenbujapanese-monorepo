import type { TimedLine } from '@zenbu/dictionary-core/captions/lines'
import { netflixCaptions } from '@zenbu/dictionary-core/captions/netflix'
import { captionLabels } from './labels'
import type { CaptionTracks } from './messages'
import { ttmlLines } from './netflix-ttml'
import { type Fetch, type Fetched, requestTimeout } from './youtube-requests'

export type NetflixFetched = Exclude<Fetched, { state: 'rate-limited' }>

type Tracks = Extract<CaptionTracks, { state: 'tracks' }>

const trackHost = '.oca.nflxvideo.net'

const failed = (reason: string): NetflixFetched => ({ state: 'failed', reason })

function trackURL(url: string | null): string | null {
  if (url === null || !URL.canParse(url)) return null
  const parsed = new URL(url)
  return parsed.protocol === 'https:' && parsed.hostname.endsWith(trackHost) ? parsed.href : null
}

const timedText = (url: string, fetch: Fetch) =>
  fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(requestTimeout) })

async function englishLines(url: string | null, fetch: Fetch): Promise<TimedLine[] | null> {
  const trusted = trackURL(url)
  if (!trusted) return null
  const response = await timedText(trusted, fetch).catch(() => null)
  return response?.ok ? ttmlLines(await response.text()) : null
}

async function captionsOf(tracks: Tracks, fetch: Fetch): Promise<NetflixFetched> {
  const url = trackURL(tracks.japanese)
  if (!url) return failed(captionLabels.failed.unreadable)
  const [japanese, english] = await Promise.all([
    timedText(url, fetch),
    englishLines(tracks.english, fetch).catch(() => null)
  ])
  if (!japanese.ok) return failed(captionLabels.netflix.refused)
  const lines = ttmlLines(await japanese.text())
  if (!lines) return failed(captionLabels.failed.unreadable)
  const captions = netflixCaptions(lines, english)
  return captions.length > 0
    ? { state: 'lines', lines: captions }
    : { state: 'no-japanese-captions' }
}

export async function fetchNetflixCaptions(
  tracks: Promise<CaptionTracks>,
  fetch: Fetch
): Promise<NetflixFetched> {
  const found = await tracks.catch(() => null)
  if (found?.state === 'no-japanese-captions') return found
  if (found?.state !== 'tracks') return failed(captionLabels.netflix.unavailable)
  return captionsOf(found, fetch).catch(() => failed(captionLabels.netflix.unreachable))
}

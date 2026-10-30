import type { CaptionTracks } from '../messages'
import type { Fetch } from '../youtube-requests'
import english from './netflix-english.xml?raw'
import japanese from './netflix-japanese.xml?raw'

export const netflixVideo = '81234567'

export const trackHost = 'ipv4-c001-tyo001-ix.1.oca.nflxvideo.net'

export const trackURL = (trackId: string) =>
  `https://${trackHost}/?o=1&v=12&e=1700000000&t=${encodeURIComponent(trackId)}`

export const japaneseTrack = trackURL('T:ja')

export const englishTrack = trackURL('T:en')

export const netflixTracks = {
  state: 'tracks' as const,
  japanese: japaneseTrack,
  english: englishTrack as string | null
} satisfies CaptionTracks

export const netflixLines = ['今日はいい天気ですね', '散歩に行きましょう', '海へ', '部屋に入る']

export const netflixEnglish = [
  "The weather's nice today.",
  "Let's go for a walk.",
  'To the sea.',
  'Into the room.'
]

const files = new Map([
  [japaneseTrack, japanese],
  [englishTrack, english]
])

export function netflixStandIn() {
  const sent: { url: string; init?: RequestInit }[] = []
  const refused = new Map<string, number>()
  const served = new Map(files)
  const fetch: Fetch = async (url, init) => {
    sent.push({ url, init })
    const file = served.get(url)
    if (file === undefined) throw new TypeError('Failed to fetch')
    return new Response(file, { status: refused.get(url) ?? 200 })
  }
  return {
    fetch,
    sent,
    urls: () => sent.map(request => request.url),
    refuse(url: string, status: number) {
      refused.set(url, status)
    },
    serve(url: string, file: string) {
      served.set(url, file)
    }
  }
}

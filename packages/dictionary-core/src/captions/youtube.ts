import { type Caption, japaneseCaptions, type TimedLine, translationSentences } from './lines'
import { pairedCaptions } from './pairing'
import { readXML } from './xml'

export interface YouTubeCaptionTrack {
  url: string
  isAutomatic: boolean
  isTranslatable: boolean
}

export interface YouTubeVideo {
  playable: boolean
  title: string | null
  author: string | null
  track: YouTubeCaptionTrack | null
}

type Fields = Partial<Record<string, unknown>>

const fields = (value: unknown): Fields | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined

const written = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const isJapanese = (language: unknown) =>
  language === 'ja' || (typeof language === 'string' && language.startsWith('ja-'))

function parsed(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return undefined
  }
}

export function youTubeVideo(playerResponse: string): YouTubeVideo | null {
  const response = fields(parsed(playerResponse))
  if (!response) return null
  const details = fields(response.videoDetails)
  const listed = fields(fields(response.captions)?.playerCaptionsTracklistRenderer)?.captionTracks
  const japanese = (Array.isArray(listed) ? listed : []).flatMap(listing => {
    const track = fields(listing)
    const url = written(track?.baseUrl)
    return track && url && isJapanese(track.languageCode)
      ? [{ url, isAutomatic: track.kind === 'asr', isTranslatable: track.isTranslatable === true }]
      : []
  })
  return {
    playable: fields(response.playabilityStatus)?.status === 'OK',
    title: written(details?.title),
    author: written(details?.author),
    track: japanese.find(track => !track.isAutomatic) ?? japanese[0] ?? null
  }
}

const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/
const seconds = (value: string | undefined) =>
  value !== undefined && decimal.test(value) ? Number(value) : 0

const htmlEntities: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'"
}

function decodedHTML(text: string): string {
  if (!text.includes('&')) return text
  return text
    .replace(/&(?:lt|gt|quot|apos);/g, entity => htmlEntities[entity] ?? entity)
    .replace(/&#(x?)([0-9A-Fa-f]+);/g, (reference, hex: string, digits: string) => {
      if (!hex && /[^0-9]/.test(digits)) return reference
      const code = Number.parseInt(digits, hex ? 16 : 10)
      const scalar = code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
      return scalar ? String.fromCodePoint(code) : reference
    })
    .replaceAll('&amp;', '&')
}

function timedLines(timedText: string): TimedLine[] | null {
  const lines: TimedLine[] = []
  let current: TimedLine | undefined
  const readable = readXML(timedText, {
    opened(name, attributes) {
      if (name !== 'text') return
      const start = seconds(attributes.get('start'))
      current = { start, end: start + seconds(attributes.get('dur')), text: '' }
    },
    text(value) {
      if (current) current.text += value
    },
    closed(name) {
      if (name !== 'text' || !current) return
      lines.push({ ...current, text: decodedHTML(current.text) })
      current = undefined
    }
  })
  return readable ? lines : null
}

export function youTubeCaptions(timedText: string): Caption[] | null {
  const lines = timedLines(timedText)
  return lines && japaneseCaptions(lines)
}

export function youTubeTranslatedCaptions(
  captions: readonly Caption[],
  translatedTimedText: string
): Caption[] | null {
  const lines = timedLines(translatedTimedText)
  return lines && pairedCaptions(captions, translationSentences(lines))
}

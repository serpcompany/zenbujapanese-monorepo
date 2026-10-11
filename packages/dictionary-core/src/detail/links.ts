import { isKanjiCharacter } from './text'

const websiteHost = 'zenbujapanese.com'

export function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function wordSegment(decoded: string): { slug: string; entSeq: number } | null {
  const match = decoded.match(/^(?:(.*)-)?(\d+)$/u)
  if (!match) return null
  const entSeq = Number(match[2])
  return Number.isSafeInteger(entSeq) ? { slug: match[1] ?? '', entSeq } : null
}

export function parseWordSegment(segment: string): { slug: string; entSeq: number } | null {
  return wordSegment(decodeSegment(segment))
}

export type WebsitePage =
  | { kind: 'word'; entSeq: number; slug: string }
  | { kind: 'search'; query: string }
  | { kind: 'kanji'; character: string }
  | { kind: 'home' }

const home: WebsitePage = { kind: 'home' }
const surroundingSpace = /^[\p{Z}\t-\r\x85]+|[\p{Z}\t-\r\x85]+$/gu

export function websitePage(host: string | null, path: string): WebsitePage {
  if (host?.toLowerCase() !== websiteHost) return home
  const [section, page, detail] = path.split('/').filter(Boolean).map(decodeSegment)
  if (section !== 'dictionary' || page === undefined) return home
  if (page === 'search') {
    const query = detail?.replace(surroundingSpace, '') ?? ''
    return query === '' ? home : { kind: 'search', query }
  }
  if (page === 'kanji') {
    return detail !== undefined && isKanjiCharacter(detail)
      ? { kind: 'kanji', character: detail }
      : home
  }
  const word = wordSegment(page)
  return word ? { kind: 'word', ...word } : home
}

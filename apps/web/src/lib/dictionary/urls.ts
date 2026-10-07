import { wordSlug } from '@zenbu/dictionary-core/detail/slug'

export { wordSlug }

export function wordPath(entry: { headword: string; reading: string; entSeq: number }): string {
  return `/dictionary/${wordSlug(entry.headword, entry.reading)}-${entry.entSeq}/`
}

export function searchPath(query: string): string {
  return `/dictionary/search/${encodeURIComponent(query).replaceAll('.', '%2E')}/`
}

export function kanjiSearchPath(character: string): string {
  return searchPath(normalizeSearchQuery(character))
}

export function hasSearchPath(query: string): boolean {
  return query !== '.' && query !== '..'
}

export function normalizeSearchQuery(raw: string): string {
  return raw.normalize('NFKC').toLowerCase().split(/\s+/u).filter(Boolean).join(' ')
}

export function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function parseWordSegment(segment: string): { slug: string; entSeq: number } | null {
  const match = decodeSegment(segment).match(/^(?:(.*)-)?(\d+)$/u)
  return match ? { slug: match[1] ?? '', entSeq: Number(match[2]) } : null
}

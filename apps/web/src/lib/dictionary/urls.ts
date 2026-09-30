import { wordSlug } from '@zenbu/dictionary-core/detail/slug'

export { wordSlug }

export function wordPath(entry: { headword: string; reading: string; entSeq: number }): string {
  return `/dictionary/${wordSlug(entry.headword, entry.reading)}-${entry.entSeq}/`
}

export function conjugationsPath(wordPagePath: string): string {
  return `${wordPagePath}conjugations/`
}

export function conjugatedFormPath(
  wordPagePath: string,
  mode: 'Plain' | 'Polite',
  kind: string
): string {
  return `${conjugationsPath(wordPagePath)}${mode.toLowerCase()}/${kind}/`
}

export const politeRegisterHash = '#polite'

export function conjugationsHref(tablePath: string, mode: 'Plain' | 'Polite'): string {
  return mode === 'Polite' ? `${tablePath}${politeRegisterHash}` : tablePath
}

export function kanjiPath(character: string): string {
  return `/dictionary/kanji/${character}/`
}

export function searchPath(query: string): string {
  return `/dictionary/search/${encodeURIComponent(query).replaceAll('.', '%2E')}/`
}

export function searchExamplesPath(query: string): string {
  return `${searchPath(query)}examples/`
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

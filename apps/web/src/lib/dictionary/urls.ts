// Dictionary URL rules from ADR 0007 (issue 461).

/** A word's readable slug: its headword, with characters that break paths replaced by `-`. */
export function wordSlug(headword: string, reading: string): string {
  const slug = headword
    .normalize('NFC')
    .replace(/[/?#%\\\s]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug || reading
}

export function wordPath(entry: { headword: string; reading: string; entSeq: number }): string {
  return `/dictionary/${wordSlug(entry.headword, entry.reading)}-${entry.entSeq}/`
}

/** The path is the exact character and is never Unicode-normalized. */
export function kanjiPath(character: string): string {
  return `/dictionary/kanji/${character}/`
}

export function searchPath(query: string): string {
  return `/dictionary/search/${encodeURIComponent(query)}/`
}

/** Compatibility-composed, lowercased, and with whitespace runs collapsed, as the app does. */
export function normalizeSearchQuery(raw: string): string {
  return raw.normalize('NFKC').toLowerCase().split(/\s+/u).filter(Boolean).join(' ')
}

/** A path segment as written, whether or not the router already decoded it. */
export function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** `要る-1546640` or a bare `1546640`: the slug is only for reading; the number decides. */
export function parseWordSegment(segment: string): { slug: string; entSeq: number } | null {
  const match = decodeSegment(segment).match(/^(?:(.*)-)?(\d+)$/u)
  return match ? { slug: match[1] ?? '', entSeq: Number(match[2]) } : null
}

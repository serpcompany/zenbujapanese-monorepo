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

/**
 * A word's conjugation table, under its word page, as the app pushes it from Word Detail:
 * `/dictionary/見る-1259290/conjugations/`.
 */
export function conjugationsPath(wordPagePath: string): string {
  return `${wordPagePath}conjugations/`
}

/**
 * A conjugated form's screen, under the table, named by its register and kind as the app names
 * them (`ConjugationMode`, `ConjugatedForm.Kind`): `/dictionary/見る-1259290/conjugations/polite/
 * past-negative/`. Each register has its own screen, as the app's route carries the mode.
 */
export function conjugatedFormPath(
  wordPagePath: string,
  mode: 'Plain' | 'Polite',
  kind: string
): string {
  return `${conjugationsPath(wordPagePath)}${mode.toLowerCase()}/${kind}/`
}

/** The address fragment that keeps the table in its Polite register. */
export const politeRegisterHash = '#polite'

/**
 * A link to the conjugation table in a register: Polite keeps its register in the address, so
 * returning from a Polite form shows Polite again, as the app's Back does.
 */
export function conjugationsHref(tablePath: string, mode: 'Plain' | 'Polite'): string {
  return mode === 'Polite' ? `${tablePath}${politeRegisterHash}` : tablePath
}

/** The path is the exact character and is never Unicode-normalized. */
export function kanjiPath(character: string): string {
  return `/dictionary/kanji/${character}/`
}

/**
 * A kanji element's page, which the app opens from a kanji's Elements, keyed like a kanji page by
 * the exact glyph, never Unicode-normalized. The app opens an element on its own, not as part of
 * a kanji, so its path doesn't name one.
 */
export function kanjiElementPath(glyph: string): string {
  return `/dictionary/elements/${glyph}/`
}

/**
 * `.` is encoded too: a segment such as `3.14` would otherwise look like a file and lose its
 * trailing slash. A query of only dots can't be a path segment at all, since URL parsing treats
 * `.`, `..`, and their encodings as the current and parent directory; see `hasSearchPath`.
 */
export function searchPath(query: string): string {
  return `/dictionary/search/${encodeURIComponent(query).replaceAll('.', '%2E')}/`
}

/** A search's Example Sentences page, which its "View N Example Sentences" row opens. */
export function searchExamplesPath(query: string): string {
  return `${searchPath(query)}examples/`
}

/** Whether a search can live at its own path; `.` and `..` can't. */
export function hasSearchPath(query: string): boolean {
  return query !== '.' && query !== '..'
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

/**
 * `要る-1546640` or a bare `1546640`: the slug is only for reading; the number decides. The page
 * redirects any segment that isn't exactly `<slug>-<ent_seq>`, such as `要る-01546640`.
 */
export function parseWordSegment(segment: string): { slug: string; entSeq: number } | null {
  const match = decodeSegment(segment).match(/^(?:(.*)-)?(\d+)$/u)
  return match ? { slug: match[1] ?? '', entSeq: Number(match[2]) } : null
}

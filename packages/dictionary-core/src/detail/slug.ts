// A word page's slug (ADR 0007): shared, so every client builds the same word URL, as the app's
// share links and the website do.

/** A word's readable slug: its headword, with characters that break paths replaced by `-`. */
export function wordSlug(headword: string, reading: string): string {
  const slug = headword
    .normalize('NFC')
    .replace(/[/?#%\\\s]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug || reading
}

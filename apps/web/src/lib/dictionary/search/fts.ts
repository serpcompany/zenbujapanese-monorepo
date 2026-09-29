// The app queries its FTS4 indexes with `ftsPhrase` and `ftsPrefix` in
// apps/ios/Modules/Sources/SearchExperience/LookupClient.swift. D1 only has FTS5, which reads
// the same strings differently, so these build the FTS5 query that matches what FTS4 matches.

/** FTS4's `simple` and `porter` and FTS5's `ascii` tokenizers split on ASCII punctuation and spaces. */
function isTokenCharacter(character: string): boolean {
  return (character.codePointAt(0) ?? 0) >= 0x80 || /[0-9A-Za-z]/.test(character)
}

/**
 * The app's `ftsPhrase(value)`: `value` in quotes, with inner quotes doubled. FTS4 reads each
 * doubled quote as the end of one phrase and the start of the next, requires every phrase,
 * matches nothing when a phrase has no words, and treats a `*` right after a word as a prefix,
 * even mid-phrase. Returns the FTS5 query that matches the same rows, or null when FTS4 matches
 * nothing.
 */
export function fts4Phrase(value: string): string | null {
  const phrases: string[] = []
  for (const piece of value.split('"')) {
    // FTS5 allows a prefix only at the end of a string, so a mid-phrase prefix ends one string
    // and `+` joins the next: FTS4's "ta*be" is FTS5's "ta"* + "be".
    const strings: string[] = []
    let text = ''
    let hasWord = false
    let previous = ''
    for (const character of piece) {
      if (character === '*') {
        if (isTokenCharacter(previous)) {
          strings.push(`"${text}"*`)
          text = ''
          hasWord = false
        }
      } else {
        text += character
        if (isTokenCharacter(character)) hasWord = true
      }
      previous = character
    }
    if (hasWord) strings.push(`"${text}"`)
    if (strings.length === 0) return null
    phrases.push(strings.join(' + '))
  }
  return phrases.join(' ')
}

/** The app's `ftsPrefix(value)`: a bare prefix query for a single word, otherwise a phrase. */
export function fts4Prefix(value: string): string | null {
  return /^[\p{L}\p{M}\p{N}]+$/u.test(value) ? `${value}*` : fts4Phrase(value)
}

/** An FTS5 phrase for the website's own `form_chars` index, with quotes escaped as FTS5 expects. */
export function fts5Phrase(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

// Character helpers the ports share. Swift's Character is an extended grapheme cluster, so
// these work on graphemes wherever the Swift code iterates Characters.

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })

/** The string's Swift Characters. */
export function graphemes(value: string): string[] {
  return Array.from(segmenter.segment(value), ({ segment }) => segment)
}

/**
 * Whether a UTF-16 code unit is always a grapheme of its own: printable ASCII, and the CJK, kana,
 * and full-width blocks, less their combining marks (U+302A–U+302F, U+3099–U+309A, and the
 * half-width sound marks U+FF9E–U+FF9F). None is a surrogate, control, joiner, or variation
 * selector, so no rule of Unicode's grapheme clusters (UAX #29) joins two of them.
 */
function isSingleUnitGrapheme(unit: number): boolean {
  return (
    (unit >= 0x20 && unit <= 0x7e) ||
    (unit >= 0x3000 &&
      unit <= 0x30ff &&
      !(unit >= 0x302a && unit <= 0x302f) &&
      unit !== 0x3099 &&
      unit !== 0x309a) ||
    (unit >= 0x4e00 && unit <= 0x9fff) ||
    (unit >= 0xff00 && unit <= 0xffef && unit !== 0xff9e && unit !== 0xff9f)
  )
}

/**
 * `graphemes(value).length`, without segmenting the text when every code unit is a grapheme of
 * its own, as in most of Tatoeba's Japanese: example retrieval counts every matching sentence.
 */
export function graphemeCount(value: string): number {
  for (let index = 0; index < value.length; index++) {
    if (!isSingleUnitGrapheme(value.charCodeAt(index))) return graphemes(value).length
  }
  return value.length
}

const codePoints = (value: string) => Array.from(value, scalar => scalar.codePointAt(0) ?? 0)

/** DictionaryEntry.swift's isCJKUnifiedIdeograph: any scalar in U+3400–U+9FFF. */
export function isCJKUnifiedIdeograph(character: string): boolean {
  return codePoints(character).some(code => code >= 0x3400 && code <= 0x9fff)
}

/**
 * KanjiLookupClient.swift's `KanjiCharacter.init`: one scalar in the CJK ideograph blocks,
 * including compatibility ideographs and the supplementary planes.
 */
export function isKanjiCharacter(value: string): boolean {
  const scalars = codePoints(value)
  if (scalars.length !== 1) return false
  const [code] = scalars
  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x20000 && code <= 0x2fa1f) ||
    (code >= 0x30000 && code <= 0x323af)
  )
}

/**
 * Katakana to hiragana, scalar by scalar, as KanjiDetailView.swift's `hiragana`: U+30A1–U+30F6
 * move down 0x60, and everything else, such as ー, stays.
 */
export function hiragana(value: string): string {
  return value.replace(/[ァ-ヶ]/gu, character =>
    String.fromCodePoint((character.codePointAt(0) ?? 0) - 0x60)
  )
}

/** Hiragana to katakana, as WordDetailView.swift's `katakana`: U+3041–U+3096 move up 0x60. */
export function katakana(value: string): string {
  return value.replace(/[ぁ-ゖ]/gu, character =>
    String.fromCodePoint((character.codePointAt(0) ?? 0) + 0x60)
  )
}

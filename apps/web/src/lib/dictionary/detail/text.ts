// Character helpers the ports share. Swift's Character is an extended grapheme cluster, so
// these work on graphemes wherever the Swift code iterates Characters.

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })

/** The string's Swift Characters. */
export function graphemes(value: string): string[] {
  return Array.from(segmenter.segment(value), ({ segment }) => segment)
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

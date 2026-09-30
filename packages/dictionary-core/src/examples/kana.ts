// Foundation's `applyingTransform(.hiraganaToKatakana, reverse:)`, which the app's example links
// use (JapaneseTextAnalysisClient.swift, LinkedJapaneseText.swift). It is ICU's
// Hiragana-Katakana transliterator, which does more than shift U+3041–U+3096 by 0x60: it folds
// halfwidth and circled katakana first, spells ヿ and ゟ out, maps the iteration marks, and
// composes the result. The cases below were read from Foundation on macOS (kana.test.ts pins them).

/** Halfwidth (U+FF61–U+FF9F) and circled (U+32D0–U+32FE) katakana, which ICU folds first. */
const foldedFirst = /[｡-ﾟ㋐-㋾]/gu

function fold(value: string): string {
  return value.replace(foldedFirst, character => character.normalize('NFKC'))
}

const toHiraganaSpecial: Record<string, string> = {
  ヵ: 'か',
  ヶ: 'け',
  ヷ: 'わ゙',
  ヸ: 'ゐ゙',
  ヹ: 'ゑ゙',
  ヺ: 'を゙',
  ヽ: 'ゝ',
  ヾ: 'ゞ',
  ヿ: 'こと',
  ゟ: 'より'
}

const toKatakanaSpecial: Record<string, string> = {
  ゝ: 'ヽ',
  ゞ: 'ヾ',
  ゟ: 'ヨリ'
}

/** `applyingTransform(.hiraganaToKatakana, reverse: true)`: katakana to hiragana. */
export function toHiragana(value: string): string {
  return fold(value)
    .replace(/[ァ-ヿゟ]/gu, character => {
      const special = toHiraganaSpecial[character]
      if (special !== undefined) return special
      const code = character.codePointAt(0) ?? 0
      return code <= 0x30f4 ? String.fromCodePoint(code - 0x60) : character
    })
    .normalize('NFC')
}

/** `applyingTransform(.hiraganaToKatakana, reverse: false)`: hiragana to katakana. */
export function toKatakana(value: string): string {
  return fold(value)
    .replace(/[ぁ-ゔゝ-ゟ]/gu, character => {
      const special = toKatakanaSpecial[character]
      if (special !== undefined) return special
      return String.fromCodePoint((character.codePointAt(0) ?? 0) + 0x60)
    })
    .normalize('NFC')
}

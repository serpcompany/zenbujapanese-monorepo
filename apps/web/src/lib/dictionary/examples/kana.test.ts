import { describe, expect, test } from 'vitest'
import { toHiragana, toKatakana } from './kana'

// Read from Foundation's applyingTransform(.hiraganaToKatakana, reverse:) on macOS.
describe('ICU Hiragana-Katakana', () => {
  test.each([
    ['ミル', 'みる'],
    ['ヴァ', 'ゔぁ'],
    ['ヵヶ', 'かけ'],
    ['ヽヾ', 'ゝゞ'],
    ['ヷ', 'わ゙'],
    ['ヿ', 'こと'],
    ['ゟ', 'より'],
    ['ゕゖ', 'ゕゖ'],
    ['ー・', 'ー・'],
    ['ｶﾞ', 'が'],
    ['ｳﾞ', 'ゔ'],
    ['㋐', 'あ'],
    ['｢人権｣', '「人権」'],
    ['漢字Ａa', '漢字Ａa']
  ])('%s to hiragana is %s', (katakana, hiragana) => {
    expect(toHiragana(katakana)).toBe(hiragana)
  })

  test.each([
    ['みる', 'ミル'],
    ['ゔ', 'ヴ'],
    ['ゝゞ', 'ヽヾ'],
    ['ゟ', 'ヨリ'],
    ['ゕゖ', 'ゕゖ'],
    ['ヵヶ', 'ヵヶ'],
    ['ｶﾞ', 'ガ'],
    ['が', 'ガ'],
    ['漢字', '漢字']
  ])('%s to katakana is %s', (hiragana, katakana) => {
    expect(toKatakana(hiragana)).toBe(katakana)
  })
})

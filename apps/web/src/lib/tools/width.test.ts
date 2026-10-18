import { describe, expect, test } from 'vitest'
import { everyWidthChange, fullToHalf, halfToFull, type WidthOptions } from './width'

const half = 'ｶﾞｯｺｳ ﾊﾟﾝ ABC'
const full = 'ガッコウ　パン　ＡＢＣ'

const without = (change: keyof WidthOptions): WidthOptions => ({
  ...everyWidthChange,
  [change]: false
})

describe('half-width to full-width', () => {
  test('with every option on, katakana, letters, and spaces all widen', () => {
    expect(halfToFull(half, everyWidthChange)).toBe(full)
  })

  test.each([
    ['katakana', 'ｶﾞｯｺｳ　ﾊﾟﾝ　ＡＢＣ'],
    ['lettersAndNumbers', 'ガッコウ　パン　ABC'],
    ['symbolsAndSpaces', 'ガッコウ パン ＡＢＣ']
  ] as const)('with %s off, that kind stays as it is', (change, expected) => {
    expect(halfToFull(half, without(change))).toBe(expected)
  })

  test('a kana and its sound mark join into one character', () => {
    expect(halfToFull('ｶﾞｷﾞﾊﾟｳﾞｦﾞﾜﾞ', everyWidthChange)).toBe('ガギパヴヺヷ')
    expect(halfToFull('ｱﾞﾞ', everyWidthChange)).toBe('ア゛゛')
  })

  test('punctuation, numbers, and symbols widen, and hiragana and kanji stay', () => {
    expect(halfToFull('｢ﾔﾏﾀﾞ｣､123-4!', everyWidthChange)).toBe('「ヤマダ」、１２３－４！')
    expect(halfToFull('ひらがな 漢字', everyWidthChange)).toBe('ひらがな　漢字')
  })
})

describe('full-width to half-width', () => {
  test('with every option on, katakana, letters, and spaces all narrow', () => {
    expect(fullToHalf(full, everyWidthChange)).toBe(half)
  })

  test.each([
    ['katakana', 'ガッコウ パン ABC'],
    ['lettersAndNumbers', 'ｶﾞｯｺｳ ﾊﾟﾝ ＡＢＣ'],
    ['symbolsAndSpaces', 'ｶﾞｯｺｳ　ﾊﾟﾝ　ABC']
  ] as const)('with %s off, that kind stays as it is', (change, expected) => {
    expect(fullToHalf(full, without(change))).toBe(expected)
  })

  test('a voiced kana splits into the kana and its mark', () => {
    expect(fullToHalf('ガギパヴヺヷ', everyWidthChange)).toBe('ｶﾞｷﾞﾊﾟｳﾞｦﾞﾜﾞ')
  })

  test('punctuation, numbers, and symbols narrow, and hiragana and kanji stay', () => {
    expect(fullToHalf('「ヤマダ」、１２３－４！', everyWidthChange)).toBe('｢ﾔﾏﾀﾞ｣､123-4!')
    expect(fullToHalf('ひらがな　漢字', everyWidthChange)).toBe('ひらがな 漢字')
  })

  test('kana with no half-width form stay as they are', () => {
    expect(fullToHalf('ヮヵヶ', everyWidthChange)).toBe('ヮヵヶ')
  })
})

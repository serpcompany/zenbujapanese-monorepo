import { describe, expect, test } from 'vitest'
import { spellingRuleExamples, typingTipExamples, widthRowShapes } from './content'
import { kanaToRomaji } from './kana-to-romaji'
import { romajiToKana } from './romaji-to-kana'
import { everyWidthChange, fullToHalf, halfToFull, type WidthOptions } from './width'

const nothingChanges: WidthOptions = {
  katakana: false,
  lettersAndNumbers: false,
  symbolsAndSpaces: false
}

describe('the reference copy matches what the converters do', () => {
  test('every typing tip types what it says', () => {
    for (const [tip, examples] of Object.entries(typingTipExamples)) {
      for (const [romaji, kana] of examples) expect(romajiToKana(romaji), tip).toBe(kana)
    }
  })

  test('every spelling rule spells what it says', () => {
    for (const [rule, examples] of Object.entries(spellingRuleExamples)) {
      for (const [kana, romaji] of examples) {
        expect(kanaToRomaji(kana), rule).toBe(romaji)
      }
    }
  })

  test('every row of the width table converts both ways with its option alone', () => {
    for (const row of widthRowShapes) {
      const options = row.change ? { ...nothingChanges, [row.change]: true } : everyWidthChange
      expect(halfToFull(row.half, options), row.id).toBe(row.full)
      expect(fullToHalf(row.full, options), row.id).toBe(row.half)
    }
  })
})

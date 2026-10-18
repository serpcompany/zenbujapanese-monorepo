import { describe, expect, test } from 'vitest'
import { spellingRules, typingTips, widthRows } from './content'
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
    for (const tip of typingTips) {
      for (const [romaji, kana] of tip.examples) expect(romajiToKana(romaji), tip.label).toBe(kana)
    }
  })

  test('every spelling rule spells what it says', () => {
    for (const rule of spellingRules) {
      for (const [kana, romaji] of rule.examples) {
        expect(kanaToRomaji(kana), rule.label).toBe(romaji)
      }
    }
  })

  test('every row of the width table converts both ways with its option alone', () => {
    for (const row of widthRows) {
      const options = row.change ? { ...nothingChanges, [row.change]: true } : everyWidthChange
      expect(halfToFull(row.half, options), row.kind).toBe(row.full)
      expect(fullToHalf(row.full, options), row.kind).toBe(row.half)
    }
  })
})

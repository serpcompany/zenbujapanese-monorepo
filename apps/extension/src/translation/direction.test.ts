import { describe, expect, it } from 'vitest'
import { directionOf } from './direction'

const japaneseToEnglish = { from: 'ja', to: 'en' }
const englishToJapanese = { from: 'en', to: 'ja' }

describe('directionOf, with the cases of the app’s WrittenLanguageTests', () => {
  it.each([
    '駅まで歩いて何分ですか？',
    'トイレはどこですか',
    'Suicaカードはどこで買えますか',
    'ｶﾀｶﾅ',
    '\u{4DC0}',
    '\u{20BB7}'
  ])('translates %s from Japanese to English, since it has Japanese in it', text => {
    expect(directionOf(text)).toEqual(japaneseToEnglish)
  })

  it.each([
    'Where can I buy a Suica card?',
    'how much is this?'
  ])('translates %s from English to Japanese, since it has only Latin letters', text => {
    expect(directionOf(text)).toEqual(englishToJapanese)
  })

  it.each(['  123 ？！ ', 'ＳＵＩＣＡ', ''])('has no direction for %j', text => {
    expect(directionOf(text)).toBeNull()
  })
})

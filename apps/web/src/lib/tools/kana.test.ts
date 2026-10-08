import { expect, test } from 'vitest'
import { toHiragana, toKatakana } from './kana'

test('hiragana turns into katakana, small kana and iteration marks included', () => {
  expect(toKatakana('こーひー、すまーとふぉん')).toBe('コーヒー、スマートフォン')
  expect(toKatakana('ゔぁぃおりん、ゝゞ')).toBe('ヴァィオリン、ヽヾ')
})

test('katakana turns into hiragana, and ヷ to ヺ, which have none, stay', () => {
  expect(toHiragana('コンピューター、ヴ、ヽヾ')).toBe('こんぴゅーたー、ゔ、ゝゞ')
  expect(toHiragana('ヷヸヹヺ')).toBe('ヷヸヹヺ')
})

test('kanji, letters, and punctuation stay as they are', () => {
  expect(toKatakana('日本語のABC。')).toBe('日本語ノABC。')
  expect(toHiragana('日本語ノABC。')).toBe('日本語のABC。')
})

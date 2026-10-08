import { describe, expect, test } from 'vitest'
import { romajiToKana } from './romaji-to-kana'

describe('romaji to kana', () => {
  test.each([
    ['konnichiwa', 'こんにちわ'],
    ["kin'en", 'きんえん'],
    ['kin’en', 'きんえん'],
    ['kinnen', 'きんねん'],
    ['kitte', 'きって'],
    ['matcha', 'まっちゃ'],
    ['shinbun', 'しんぶん'],
    ['shimbun', 'しんぶん'],
    ['sampo', 'さんぽ'],
    ['onna', 'おんな'],
    ['hon', 'ほん'],
    ['honn', 'ほん'],
    ['kanyou', 'かにょう'],
    ["kan'you", 'かんよう'],
    ['arigatou', 'ありがとう'],
    ['kyou', 'きょう'],
    ['shashin', 'しゃしん'],
    ['tsukue', 'つくえ'],
    ['fuji', 'ふじ'],
    ['wo', 'を']
  ])('%s is %s', (romaji, kana) => {
    expect(romajiToKana(romaji)).toBe(kana)
  })

  test.each([
    ['si', 'し'],
    ['tu', 'つ'],
    ['hu', 'ふ'],
    ['zi', 'じ'],
    ['sya', 'しゃ'],
    ['tya', 'ちゃ'],
    ['jya', 'じゃ'],
    ['xa', 'ぁ'],
    ['la', 'ぁ'],
    ['xtu', 'っ'],
    ['ltsu', 'っ'],
    ['xya', 'ゃ'],
    ['thi', 'てぃ'],
    ['fa', 'ふぁ'],
    ['vu', 'ゔ']
  ])('takes the other common spelling %s for %s', (romaji, kana) => {
    expect(romajiToKana(romaji)).toBe(kana)
  })

  test('a hyphen types the long mark, in either script', () => {
    expect(romajiToKana('ko-hi-')).toBe('こーひー')
    expect(romajiToKana('ko-hi-', 'katakana')).toBe('コーヒー')
  })

  test('writes katakana when asked', () => {
    expect(romajiToKana('tokyo', 'katakana')).toBe('トキョ')
    expect(romajiToKana('pa-thi-', 'katakana')).toBe('パーティー')
  })

  test('a trailing n is ん, and a lone consonant waits for its vowel', () => {
    expect(romajiToKana('n')).toBe('ん')
    expect(romajiToKana('ten')).toBe('てん')
    expect(romajiToKana('k')).toBe('k')
    expect(romajiToKana('kk')).toBe('っk')
    expect(romajiToKana('sh')).toBe('sh')
  })

  test('reads capitals as lowercase, and keeps what it can’t read as it was', () => {
    expect(romajiToKana('Sushi')).toBe('すし')
    expect(romajiToKana('TOKYO')).toBe('ときょ')
    expect(romajiToKana('Q 2026')).toBe('Q 2026')
    expect(romajiToKana('日本 desu')).toBe('日本 です')
  })

  test('turns punctuation into its Japanese form', () => {
    expect(romajiToKana('hai, sou desu. [hon]?!~')).toBe('はい、 そう です。 「ほん」？！〜')
  })

  test('spells a vowel with a macron long', () => {
    expect(romajiToKana('Tōkyō')).toBe('とうきょう')
    expect(romajiToKana('rāmen')).toBe('らあめん')
    expect(romajiToKana('kōhī', 'katakana')).toBe('コーヒー')
  })
})

import { describe, expect, test } from 'vitest'
import { kanaToRomaji } from './kana-to-romaji'

describe('kana to romaji, in Hepburn', () => {
  test.each([
    ['きって', 'kitte'],
    ['まっちゃ', 'matcha'],
    ['きんえん', "kin'en"],
    ['しんよう', "shin'you"],
    ['しんぶん', 'shinbun'],
    ['コーヒー', 'koohii'],
    ['とうきょう', 'toukyou'],
    ['すし', 'sushi'],
    ['つくえ', 'tsukue'],
    ['ふじ', 'fuji'],
    ['ちゃ', 'cha'],
    ['じゃ', 'ja'],
    ['ぢ', 'ji'],
    ['づ', 'zu'],
    ['を', 'o'],
    ['ほん', 'hon'],
    ['パーティー', 'paatii'],
    ['ヴァイオリン', 'vaiorin'],
    ['ファン', 'fan']
  ])('%s is %s', (kana, romaji) => {
    expect(kanaToRomaji(kana)).toBe(romaji)
  })

  test('spells long vowels as they are written, and ー repeats the vowel before it', () => {
    expect(kanaToRomaji('おおきい')).toBe('ookii')
    expect(kanaToRomaji('ラーメン')).toBe('raamen')
    expect(kanaToRomaji('ンー')).toBe('n-')
  })

  test('keeps kanji, letters, and numbers as they are, and turns punctuation into its Latin form', () => {
    expect(kanaToRomaji('日本へ いく。')).toBe('日本he iku.')
    expect(kanaToRomaji('「はい」、ABC 2026？')).toBe('"hai",ABC 2026?')
    expect(kanaToRomaji('コーヒー・ティー')).toBe('koohii tii')
  })

  test('a small っ before something that isn’t a consonant doubles nothing', () => {
    expect(kanaToRomaji('あっ')).toBe('a')
    expect(kanaToRomaji('えっ？')).toBe('e?')
  })
})

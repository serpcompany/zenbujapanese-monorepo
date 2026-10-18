import { describe, expect, test } from 'vitest'
import { kanaToRomaji } from './kana-to-romaji'
import { romajiToKana } from './romaji-to-kana'

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

  test('a small っ with no consonant after it is spelled xtsu, so it converts back', () => {
    expect(kanaToRomaji('あっ')).toBe('axtsu')
    expect(kanaToRomaji('えっ？')).toBe('extsu?')
    expect(kanaToRomaji('っ')).toBe('xtsu')
    for (const kana of ['あっ', 'っ', 'っあ', 'えっ？']) {
      expect(romajiToKana(kanaToRomaji(kana))).toBe(kana)
    }
  })

  test('spells the common loanword combinations', () => {
    expect(kanaToRomaji('モーツァルト')).toBe('mootsaruto')
    expect(kanaToRomaji('デュエット')).toBe('dyuetto')
    expect(kanaToRomaji('フュージョン')).toBe('fyuujon')
    expect(kanaToRomaji('クァルテット')).toBe('kwarutetto')
  })

  test('keeps a kana it has no spelling for in the script it was typed in', () => {
    expect(kanaToRomaji('ヽヾ')).toBe('ヽヾ')
    expect(kanaToRomaji('ヱビス')).toBe('ebisu')
  })
})

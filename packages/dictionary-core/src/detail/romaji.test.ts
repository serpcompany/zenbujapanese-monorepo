import { describe, expect, test } from 'vitest'
import { attachment, romaji, sentenceRomaji } from './romaji'

describe('romaji', () => {
  test.each([
    ['さくら', 'sakura'],
    ['カメラ', 'kamera'],
    ['しずか', 'shizuka'],
    ['つづく', 'tsudzuku'],
    ['はなぢ', 'hanadji'],
    ['わをん', 'wawon']
  ])('%s is written one syllable at a time: %s', (reading, written) => {
    expect(romaji(reading)).toBe(written)
  })

  test.each([
    ['きょう', 'kyou'],
    ['しゃしん', 'shashin'],
    ['ぎゅうにゅう', 'gyuunyuu'],
    ['ぢゃ', 'dja'],
    ['ジュース', 'jūsu']
  ])('%s joins a small ya, yu, or yo to the syllable before: %s', (reading, written) => {
    expect(romaji(reading)).toBe(written)
  })

  test('a long mark puts a macron on the vowel before; a vowel written out stays', () => {
    expect(romaji('らーめん')).toBe('rāmen')
    expect(romaji('コーヒー')).toBe('kōhī')
    expect(romaji('とうきょう')).toBe('toukyou')
    expect(romaji('ー')).toBe('ー')
  })

  test.each([
    ['きって', 'kitte'],
    ['ざっし', 'zasshi'],
    ['まっちゃ', 'matcha'],
    ['ベッド', 'beddo'],
    ['カップ', 'kappu'],
    ['あっ', 'a~tsu']
  ])('%s doubles the consonant after a small tsu: %s', (reading, written) => {
    expect(romaji(reading)).toBe(written)
  })

  test.each([
    ['しんぶん', 'shinbun'],
    ['きんえん', "kin'en"],
    ['ほんや', "hon'ya"],
    ['こんにちは', "kon'nichiha"]
  ])('%s marks an n before a vowel, y, or n: %s', (reading, written) => {
    expect(romaji(reading)).toBe(written)
  })

  test.each([
    ['んあ', "n'a"],
    ['あんい', "an'i"],
    ['しんよう', "shin'you"],
    ['はんのう', "han'nou"],
    ['んんん', "n'n'n"],
    ['んーか', 'n\u{304}ka'],
    ['っっか', '~tsukka'],
    ['っー', '~tsū'],
    ['きゃっきゃ', 'kyakkya'],
    ['いっしょうけんめい', 'isshoukenmei'],
    ['ふぁん', 'fan'],
    ['てぃー', 'tī'],
    ['うぃ', 'u~i'],
    ['ヴァ', 'vu~a'],
    ['コンピューター', 'konpyūtā'],
    ['ウォッカ', 'u~okka'],
    ['ヵヶ', '~ka~ke'],
    ['くゎ', 'ku~wa'],
    ['ーあ', '\u{304}a'],
    ['ぁあ', '~aa'],
    ['んんんんんか', "n'n'n'n'nka"]
  ])('%s reads the same in pieces as it does whole: %s', (reading, written) => {
    expect(romaji(reading)).toBe(written)
    expect(romaji(reading)).toBe(written)
  })

  test('a small kana that forms no syllable keeps a tilde', () => {
    expect(romaji('ウィキ')).toBe('u~iki')
    expect(romaji('ティー')).toBe('tī')
    expect(romaji('ファイル')).toBe('fairu')
    expect(romaji('ヶ')).toBe('~ke')
  })

  test('an iteration mark repeats the syllable before, voiced when it is voiced', () => {
    expect(romaji('こゝろ')).toBe('kokoro')
    expect(romaji('すゞき')).toBe('suzuki')
    expect(romaji('ちゞむ')).toBe('chidjimu')
    expect(romaji('やゝ')).toBe('yaa')
    expect(romaji('ゝ')).toBe('')
  })

  test('halfwidth katakana reads as fullwidth', () => {
    expect(romaji('ｶﾞｷﾞｸﾞ')).toBe('gagigu')
    expect(romaji('ﾗｰﾒﾝ')).toBe('rāmen')
  })

  test('a rule sees the next syllable across a change of script', () => {
    expect(romaji('サボる')).toBe('saboru')
    expect(romaji('っカ')).toBe('kka')
    expect(romaji('んア')).toBe("n'a")
    expect(romaji('ンあ')).toBe('na')
  })

  test('punctuation next to katakana becomes Latin; next to hiragana it stays', () => {
    expect(romaji('ア、イ')).toBe('a,i')
    expect(romaji('あ、い')).toBe('a、i')
    expect(romaji('あ・い')).toBe('a・i')
  })

  test('other writing is left as written', () => {
    expect(romaji('ABC')).toBe('ABC')
    expect(romaji('βカロテン')).toBe('βkaroten')
    expect(romaji('〇')).toBe('〇')
  })

  test('a reading with kanji in it, or no reading, has no romaji', () => {
    expect(romaji('食べる')).toBeNull()
    expect(romaji('時々')).toBeNull()
    expect(romaji('')).toBeNull()
  })
})

describe('attachment', () => {
  test.each([
    ['、', 'previous'],
    ['。', 'previous'],
    ['」', 'previous'],
    ['！？', 'previous'],
    ['・', 'previous'],
    ['「', 'next'],
    ['（', 'next'],
    ['“', 'next']
  ])('%s stays with the %s word', (surface, side) => {
    expect(attachment(surface)).toBe(side)
  })

  test.each([
    '',
    '犬',
    'いぬ',
    'ー',
    '〜',
    '-',
    '1',
    'a',
    '。犬'
  ])('%j breaks like any word', surface => {
    expect(attachment(surface)).toBeNull()
  })
})

describe('sentenceRomaji', () => {
  const words = (...pairs: [string, string | null][]) =>
    pairs.map(([surface, reading]) => ({ surface, reading }))

  test('spaces words, and keeps punctuation with the word it belongs to', () => {
    expect(
      sentenceRomaji(
        words(
          ['「', '「'],
          ['ペン', 'ペン'],
          ['を', 'ヲ'],
          ['持っています', 'モッテイマス'],
          ['か', 'カ'],
          ['」', '」']
        )
      )
    ).toBe('「pen wo motteimasu ka」')
  })

  test('keeps a space that is written in the sentence', () => {
    expect(sentenceRomaji(words(['トム', 'トム'], ['！', '！'], [' ', null], ['何', 'ナニ']))).toBe(
      'tomu！ nani'
    )
  })

  test('reads a word by its surface when the analyser gives no reading', () => {
    expect(sentenceRomaji(words(['3', null], ['m', '*'], ['です', '']))).toBe('3 m desu')
  })

  test('has no romaji when a word is left in kanji, or there are no words', () => {
    expect(sentenceRomaji(words(['試', '試'], ['着', 'チャク']))).toBeNull()
    expect(sentenceRomaji(words(['試着', null]))).toBeNull()
    expect(sentenceRomaji([])).toBeNull()
  })
})

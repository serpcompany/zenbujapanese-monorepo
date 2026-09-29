import { describe, expect, test } from 'vitest'
import { romanizeCompleteSentence, romanizeTrustedReading, toLatin } from './romaji'

// Expected values are Foundation's `.toLatin` transform on macOS (ICU's Any-Latin), which the
// app's AppleJapaneseRomanization uses. The word-detail and kanji-detail suites check the port
// against the app on the Simulator; these pin the transform's rules at their edges.

describe('toLatin (.toLatin on Japanese)', () => {
  test.each([
    ['みる', 'miru'],
    ['とうきょう', 'toukyou'],
    ['がっこう', 'gakkou'],
    ['コーヒー', 'kōhī'],
    ['きんえん', "kin'en"],
    ['こんにちは', "kon'nichiha"],
    ['しんよう', "shin'you"],
    ['ンン', "n'n"],
    ['ンー', 'n̄'],
    ['っ', '~tsu'],
    ['あっ', 'a~tsu'],
    ['っち', 'tchi'],
    ['ッチャ', 'tcha'],
    ['ッキャ', 'kkya'],
    ['ッヴ', '~tsuvu'],
    ['ヴァイオリン', 'vu~aiorin'],
    ['ティー', 'tī'],
    ['フェ', 'fe'],
    ['デュ', 'de~yu'],
    ['ぢ', 'dji'],
    ['づ', 'dzu'],
    ['ゐゑを', 'wiwewo'],
    ['ヶ', '~ke'],
    ['すゝむ', 'susumu'],
    ['いすゞ', 'isuzu'],
    ['シヽ', 'shihi'],
    ['ハヽヽ', 'hahaha'],
    ['ー', 'ー'],
    ['ーア', '̄a'],
    ['ア ー', 'a ̄'],
    ['aー', 'aー'],
    ['ア・イ', 'a・i'],
    ['ア。', 'a.'],
    ['モウ～、ナニ', 'mou～,nani'],
    ['ブルータスよ、おまえ', 'burūtasuyo、omae'],
    ['ｶﾞ', 'ga'],
    ['い.る', 'i.ru'],
    ['-イ', '-i'],
    ['ヨウ', 'you']
  ])('%s is %s', (kana, latin) => {
    expect(toLatin(kana)).toBe(latin)
  })

  test('a hiragana run reads katakana after it, but not the other way round', () => {
    expect(toLatin('さんエステル')).toBe("san'esuteru")
    expect(toLatin('ボタンあな')).toBe('botanana')
    expect(toLatin('ポッと')).toBe('potto')
    expect(toLatin('だっサラ')).toBe('dassara')
    expect(toLatin('おっパブ')).toBe('o~tsupabu')
  })

  test('Greek letters and 〇 are in Latin too', () => {
    expect(toLatin('βカロテン')).toBe('bkaroten')
    expect(toLatin('ω')).toBe('ō')
    expect(toLatin('〇×テスト')).toBe('líng×tesuto')
  })
})

describe('romanizeTrustedReading', () => {
  test('a reading with kanji, or none, has no romaji', () => {
    expect(romanizeTrustedReading('')).toBeNull()
    expect(romanizeTrustedReading('人々')).toBeNull()
    expect(romanizeTrustedReading('ひとびと')).toBe('hitobito')
  })
})

describe('romanizeCompleteSentence', () => {
  test('joins words with spaces, attaching punctuation', () => {
    expect(
      romanizeCompleteSentence([
        { surface: '見る', reading: 'ミル' },
        { surface: 'から', reading: 'カラ' },
        { surface: '「', reading: '「' },
        { surface: 'だ', reading: 'ダ' },
        { surface: '」', reading: '」' },
        { surface: 'よ', reading: 'ヨ' },
        { surface: '。', reading: '。' }
      ])
    ).toBe('miru kara 「da」 yo。')
  })

  test('reads the surface of a word without a reading, and gives up on one with kanji', () => {
    expect(romanizeCompleteSentence([{ surface: 'ABC' }, { surface: 'です', reading: '*' }])).toBe(
      'ABC desu'
    )
    expect(romanizeCompleteSentence([{ surface: '猫' }])).toBeNull()
    expect(romanizeCompleteSentence([])).toBeNull()
  })

  test('keeps whitespace, and starts afresh after it', () => {
    expect(
      romanizeCompleteSentence([
        { surface: 'Tom', reading: 'Tom' },
        { surface: ' ' },
        { surface: 'は', reading: 'ハ' }
      ])
    ).toBe('Tom ha')
  })
})

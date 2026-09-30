import { describe, expect, test } from 'vitest'
import { type KanjiReadings, kanjiReadings, splitKanjiReading } from './kanji-split'
import type { KanjiReadingRow } from './rows'

const on = (value: string): KanjiReadingRow => ({ value, kind: 'on' })
const kun = (value: string): KanjiReadingRow => ({ value, kind: 'kun' })
const name = (value: string): KanjiReadingRow => ({ value, kind: 'name' })

const readings: KanjiReadings = new Map([
  ['学', [on('ガク'), kun('まな.ぶ'), name('たか')]],
  ['校', [on('コウ'), on('キョウ'), name('めん')]],
  ['人', [on('ジン'), on('ニン'), kun('ひと'), kun('-り'), kun('-と'), name('じ')]],
  ['大', [on('ダイ'), on('タイ'), kun('おお-'), kun('おお.きい'), kun('-おお.いに')]],
  ['発', [on('ハツ'), on('ホツ'), kun('た.つ'), kun('あば.く'), kun('おこ.る'), kun('つか.わす')]],
  ['表', [on('ヒョウ'), kun('おもて'), kun('-ぴょう'), kun('あらわ.す'), kun('あらわ.れる')]],
  ['弱', [on('ジャク'), kun('よわ.い'), kun('よわ.る'), kun('よわ.まる'), kun('よわ.める')]],
  ['肉', [on('ニク'), on('ジク')]],
  ['強', [on('キョウ'), on('ゴウ'), kun('つよ.い'), kun('つよ.まる'), kun('し.いる')]],
  ['食', [on('ショク'), on('ジキ'), kun('く.う'), kun('く.らう'), kun('た.べる'), kun('は.む')]],
  ['今', [on('コン'), on('キン'), kun('いま')]],
  ['日', [on('ニチ'), on('ジツ'), kun('ひ'), kun('-び'), kun('-か')]]
])

describe('splitKanjiReading (KanjiReadingSplitter.split)', () => {
  test('uses the sound changes compounds make', () => {
    expect(splitKanjiReading('学校', 'がっこう', readings)).toEqual(['がっ', 'こう'])
    expect(splitKanjiReading('人々', 'ひとびと', readings)).toEqual(['ひと', 'びと'])
    expect(splitKanjiReading('発表', 'はっぴょう', readings)).toEqual(['はっ', 'ぴょう'])
    expect(splitKanjiReading('弱肉強食', 'じゃくにくきょうしょく', readings)).toEqual([
      'じゃく',
      'にく',
      'きょう',
      'しょく'
    ])
  })

  test('has no split for a word read as a whole', () => {
    expect(splitKanjiReading('大人', 'おとな', readings)).toBeNull()
    expect(splitKanjiReading('今日', 'きょう', readings)).toBeNull()
  })

  test('has no split when a kanji has no readings, or more than one split fits', () => {
    expect(splitKanjiReading('学校', 'がっこう', new Map())).toBeNull()
    const ambiguous: KanjiReadings = new Map([
      ['甲', [kun('あ'), kun('あい')]],
      ['乙', [kun('い'), kun('')]]
    ])
    expect(splitKanjiReading('甲乙', 'あい', ambiguous)).toEqual(['あ', 'い'])
    const twoWays: KanjiReadings = new Map([
      ['甲', [kun('あ'), kun('あい')]],
      ['乙', [kun('い'), kun('う'), kun('いう')]]
    ])
    expect(splitKanjiReading('甲乙', 'あいう', twoWays)).toBeNull()
  })

  test('keeps the reading’s own kana', () => {
    expect(splitKanjiReading('学校', 'ガッコウ', readings)).toEqual(['ガッ', 'コウ'])
  })
})

describe('kanjiReadings (JapaneseRubyText.kanjiReadings)', () => {
  test('splits only a furigana segment of two or more characters', () => {
    expect(kanjiReadings({ text: '学校', reading: 'がっこう' }, readings)).toEqual(['がっ', 'こう'])
    expect(kanjiReadings({ text: '学', reading: 'がく' }, readings)).toBeNull()
    expect(kanjiReadings({ text: 'がっこう' }, readings)).toBeNull()
  })
})

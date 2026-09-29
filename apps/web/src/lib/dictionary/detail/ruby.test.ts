import { describe, expect, test } from 'vitest'
import { rubySegments } from './ruby'

// Expected values follow JapaneseRubyAnnotation.segments (JapaneseTextAnalysisClient.swift).

describe('rubySegments', () => {
  test('places each kanji run’s part of the reading over it', () => {
    // 要る (1546640)
    expect(rubySegments('要る', 'いる')).toEqual([{ text: '要', reading: 'い' }, { text: 'る' }])
    expect(rubySegments('食べ物', 'たべもの')).toEqual([
      { text: '食', reading: 'た' },
      { text: 'べ' },
      { text: '物', reading: 'もの' }
    ])
  })

  test('leaves text without kanji, or equal to its reading, alone', () => {
    // いる (1577980)
    expect(rubySegments('いる', 'いる')).toEqual([{ text: 'いる' }])
    // Ｔシャツ (1000160): a full-width letter isn't kanji, so no ruby over it.
    expect(rubySegments('Ｔシャツ', 'ティーシャツ')).toEqual([{ text: 'Ｔシャツ' }])
    // ジ・エンド (1064520): no ruby over ・.
    expect(rubySegments('ジ・エンド', 'ジ・エンド')).toEqual([{ text: 'ジ・エンド' }])
  })

  test('keeps a katakana reading as written', () => {
    // 珈琲 (1049180): all kanji, so the whole reading goes over it, still in katakana.
    expect(rubySegments('珈琲', 'コーヒー')).toEqual([{ text: '珈琲', reading: 'コーヒー' }])
    // Kana runs match the reading in either script; the ruby is sliced from the original.
    expect(rubySegments('缶コーヒー', 'カンコーヒー')).toEqual([
      { text: '缶', reading: 'カン' },
      { text: 'コーヒー' }
    ])
    expect(rubySegments('お茶', 'おちゃ')).toEqual([
      { text: 'お' },
      { text: '茶', reading: 'ちゃ' }
    ])
  })

  test('treats 々 as part of the kanji run', () => {
    // 人々 (1580650), 時々 (1598680)
    expect(rubySegments('人々', 'ひとびと')).toEqual([{ text: '人々', reading: 'ひとびと' }])
    expect(rubySegments('時々', 'ときどき')).toEqual([{ text: '時々', reading: 'ときどき' }])
    expect(rubySegments('色々な', 'いろいろな')).toEqual([
      { text: '色々', reading: 'いろいろ' },
      { text: 'な' }
    ])
  })

  test('anchors on the first match of the next kana run, as the app does', () => {
    // 黄色い声 (1182040): the い after 黄色 matches the reading's first い, so the app shows
    // き over 黄色 and ろいこえ over 声.
    expect(rubySegments('黄色い声', 'きいろいこえ')).toEqual([
      { text: '黄色', reading: 'き' },
      { text: 'い' },
      { text: '声', reading: 'ろいこえ' }
    ])
  })

  test('drops the ruby when the reading does not fit the kana runs', () => {
    expect(rubySegments('要る', 'かなめ')).toEqual([{ text: '要' }, { text: 'る' }])
    // The reading ends before the last kanji run.
    expect(rubySegments('見る目', 'みる')).toEqual([{ text: '見' }, { text: 'る' }, { text: '目' }])
  })
})

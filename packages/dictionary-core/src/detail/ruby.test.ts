import { describe, expect, test } from 'vitest'
import { rubySegments } from './ruby'

describe('rubySegments', () => {
  test('places each kanji run’s part of the reading over it', () => {
    expect(rubySegments('要る', 'いる')).toEqual([{ text: '要', reading: 'い' }, { text: 'る' }])
    expect(rubySegments('食べ物', 'たべもの')).toEqual([
      { text: '食', reading: 'た' },
      { text: 'べ' },
      { text: '物', reading: 'もの' }
    ])
  })

  test('leaves text without kanji, or equal to its reading, alone', () => {
    expect(rubySegments('いる', 'いる')).toEqual([{ text: 'いる' }])
    expect(rubySegments('Ｔシャツ', 'ティーシャツ')).toEqual([{ text: 'Ｔシャツ' }])
    expect(rubySegments('ジ・エンド', 'ジ・エンド')).toEqual([{ text: 'ジ・エンド' }])
  })

  test('keeps a katakana reading as written', () => {
    expect(rubySegments('珈琲', 'コーヒー')).toEqual([{ text: '珈琲', reading: 'コーヒー' }])
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
    expect(rubySegments('人々', 'ひとびと')).toEqual([{ text: '人々', reading: 'ひとびと' }])
    expect(rubySegments('時々', 'ときどき')).toEqual([{ text: '時々', reading: 'ときどき' }])
    expect(rubySegments('色々な', 'いろいろな')).toEqual([
      { text: '色々', reading: 'いろいろ' },
      { text: 'な' }
    ])
  })

  test('anchors on the first match of the next kana run, as the app does', () => {
    expect(rubySegments('黄色い声', 'きいろいこえ')).toEqual([
      { text: '黄色', reading: 'き' },
      { text: 'い' },
      { text: '声', reading: 'ろいこえ' }
    ])
  })

  test('drops the ruby when the reading does not fit the kana runs', () => {
    expect(rubySegments('要る', 'かなめ')).toEqual([{ text: '要' }, { text: 'る' }])
    expect(rubySegments('見る目', 'みる')).toEqual([{ text: '見' }, { text: 'る' }, { text: '目' }])
  })
})

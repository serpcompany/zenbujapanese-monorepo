import { describe, expect, test } from 'vitest'
import { furigana, partOfSpeechPhrase, pitchMorae, primaryKanji } from './display'

describe('partOfSpeechPhrase', () => {
  test('names one word class, then its modifiers', () => {
    expect(partOfSpeechPhrase(['godanVerb', 'intransitive'])).toBe('Godan verb (intransitive)')
    expect(partOfSpeechPhrase(['noun', 'takesSuru', 'transitive'])).toBe(
      'Noun · する verb (transitive)'
    )
    expect(partOfSpeechPhrase(['adverb', 'adverbTo'])).toBe('Adverb (と)')
  })
})

describe('furigana', () => {
  test('places each kanji run’s reading over it', () => {
    expect(furigana('要る', 'いる')).toEqual([{ text: '要', reading: 'い' }, { text: 'る' }])
    expect(furigana('食べ物', 'たべもの')).toEqual([
      { text: '食', reading: 'た' },
      { text: 'べ' },
      { text: '物', reading: 'もの' }
    ])
  })

  test('leaves kana alone', () => {
    expect(furigana('いる', 'いる')).toEqual([{ text: 'いる' }])
  })
})

describe('pitchMorae', () => {
  test('marks high morae for flat and falling patterns', () => {
    expect(pitchMorae('いる', 0).map(mora => mora.high)).toEqual([false, true])
    expect(pitchMorae('ようりょう', 3)).toEqual([
      { mora: 'ヨ', high: false },
      { mora: 'ウ', high: true },
      { mora: 'リョ', high: true },
      { mora: 'ウ', high: false }
    ])
  })
})

describe('primaryKanji (DictionaryEntry.primaryKanji)', () => {
  test('lists each CJK unified ideograph once, in order', () => {
    expect(primaryKanji('要る')).toEqual(['要'])
    expect(primaryKanji('日本語の日')).toEqual(['日', '本', '語'])
  })

  test('leaves out iteration marks and 〇, which the app excludes', () => {
    expect(primaryKanji('人々')).toEqual(['人'])
    expect(primaryKanji('時々')).toEqual(['時'])
    expect(primaryKanji('〇〻')).toEqual([])
  })
})

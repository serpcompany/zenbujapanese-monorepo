import { describe, expect, test } from 'vitest'
import { ipadicTokenizer } from './ipadic'
import { fixtureDictionary, fixtureFiles } from './ipadic.fixture'
import { kuromojiCandidates } from './morphology'

const files = fixtureFiles(fixtureDictionary)
const tokenize = ipadicTokenizer(file => files[file])

const found = (text: string) =>
  tokenize(text).map(token => [
    token.word_type === 'KNOWN' ? 'known' : 'unknown',
    token.word_position,
    token.surface_form,
    token.pos,
    token.basic_form,
    token.reading ?? null
  ])

describe('the tokenizer', () => {
  test('takes the path through the dictionary that costs least', () => {
    expect(found('東京都に行く')).toEqual([
      ['known', 1, '東京', '名詞', '東京', 'トウキョウ'],
      ['known', 3, '都', '名詞', '都', 'ト'],
      ['known', 4, 'に', '助詞', 'に', 'ニ'],
      ['known', 5, '行く', '動詞', '行く', 'イク']
    ])
    expect(tokenize('東京都')[1]).toMatchObject({ pos_detail_1: '接尾', pos_detail_2: '地域' })
  })

  test('numbers words from one, across the sentences 、 and 。 end', () => {
    expect(found('京都、東京。ねこ').map(([, position, surface]) => [position, surface])).toEqual([
      [1, '京都'],
      [3, '、'],
      [4, '東京'],
      [6, '。'],
      [7, 'ねこ']
    ])
    expect(found('')).toEqual([])
  })

  test('groups letters it does not know when their class says to, and not kanji', () => {
    expect(found('ねこにXYab5!?').slice(2)).toEqual([
      ['unknown', 4, 'XYab', '名詞', '*', null],
      ['unknown', 8, '5', '名詞', '*', null],
      ['unknown', 9, '!?', '記号', '*', null]
    ])
    expect(found('猫犬').map(([, , surface]) => surface)).toEqual(['猫', '犬'])
  })

  test('leaves a word without a reading when its dictionary line has none', () => {
    expect(found('東京都。')[1]).toEqual(['known', 3, '都。', '名詞', '都。', null])
  })

  test('refuses text it cannot read, as Kuromoji does', () => {
    expect(() => tokenize('京\ud83d')).toThrow(TypeError)
    expect(() => tokenize('あ5 5')).toThrow(TypeError)
  })

  test("keeps Kuromoji's count of a sentence that follows a word ending in 。", () => {
    const text = '東京都。行く'
    const tokens = tokenize(text)
    expect(tokens.map(token => [token.word_position, token.surface_form])).toEqual([
      [1, '東京'],
      [3, '都。'],
      [4, '行く']
    ])
    expect(kuromojiCandidates(text, tokens)).toBeNull()
  })

  test("keeps Kuromoji's count of characters outside the basic plane", () => {
    const text = '😀😀ねa😀'
    const tokens = tokenize(text)
    expect(tokens.map(token => [token.word_position, token.surface_form])).toEqual([
      [1, '😀😀'],
      [5, '😀']
    ])
    expect(kuromojiCandidates(text, tokens)).toBeNull()
  })

  test('reads its files once, when first asked', () => {
    let reads = 0
    const lazy = ipadicTokenizer(file => {
      reads++
      return files[file]
    })
    expect(reads).toBe(0)
    lazy('東京')
    lazy('京都')
    expect(reads).toBe(Object.keys(files).length)
  })

  test('refuses files that name no class for other characters', () => {
    const withoutDefault = fixtureFiles({
      ...fixtureDictionary,
      classes: fixtureDictionary.classes.map(kind =>
        kind.name === 'DEFAULT' ? { ...kind, name: 'OTHER' } : kind
      )
    })
    expect(() => ipadicTokenizer(file => withoutDefault[file])('東京')).toThrow(
      'The character classes do not cover every character'
    )
  })
})

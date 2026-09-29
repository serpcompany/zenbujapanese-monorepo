import { describe, expect, test } from 'vitest'
import {
  groupInflections,
  type KuromojiToken,
  kuromojiCandidates,
  type MorphologyCandidate
} from './morphology'

/** Kuromoji tokens for `pieces` ([surface, pos, pos_detail_1, basic_form, reading]), in order. */
function tokens(pieces: [string, string, string, string, string?][]): KuromojiToken[] {
  let position = 1
  return pieces.map(([surface, pos, detail, basic, reading]) => {
    const token: KuromojiToken = {
      word_type: 'KNOWN',
      word_position: position,
      surface_form: surface,
      pos,
      pos_detail_1: detail,
      pos_detail_2: '*',
      pos_detail_3: '*',
      basic_form: basic,
      ...(reading === undefined ? {} : { reading })
    }
    position += surface.length
    return token
  })
}

const surfaces = (candidates: MorphologyCandidate[]) => candidates.map(c => c.surface)

describe('kuromojiCandidates', () => {
  test('keeps the parts of speech that are set, and the dictionary form', () => {
    const [candidate] =
      kuromojiCandidates('見る', tokens([['見る', '動詞', '自立', '見る', 'ミル']])) ?? []
    expect(candidate).toMatchObject({
      surface: '見る',
      dictionaryForm: '見る',
      normalizedForm: '見る',
      reading: 'ミル',
      partOfSpeech: ['動詞', '自立'],
      isOutOfVocabulary: false
    })
  })

  test('an unknown word reads as its surface, and `*` as its dictionary form is the surface', () => {
    const [candidate] =
      kuromojiCandidates('トム', [
        { ...tokens([['トム', '名詞', '固有名詞', '*']])[0], word_type: 'UNKNOWN' }
      ]) ?? []
    expect(candidate).toMatchObject({
      dictionaryForm: 'トム',
      reading: 'トム',
      isOutOfVocabulary: true
    })
  })

  test("tokens that don't tile the text fail, as the app's invalidProviderRange", () => {
    expect(kuromojiCandidates('見るよ', tokens([['見る', '動詞', '自立', '見る']]))).toBeNull()
    const gap = tokens([
      ['見', '動詞', '自立', '見る'],
      ['よ', '助詞', '終助詞', 'よ']
    ])
    expect(kuromojiCandidates('見るよ', gap)).toBeNull()
  })
})

describe('groupInflections', () => {
  test('joins a verb with its auxiliaries and keeps the head as the dictionary form', () => {
    const candidates = kuromojiCandidates(
      '見なかった。',
      tokens([
        ['見', '動詞', '自立', '見る', 'ミ'],
        ['なかっ', '助動詞', '*', 'ない', 'ナカッ'],
        ['た', '助動詞', '*', 'た', 'タ'],
        ['。', '記号', '句点', '。', '。']
      ])
    ) as MorphologyCandidate[]
    const [joined, period] = groupInflections(candidates)
    expect(joined).toMatchObject({
      surface: '見なかった',
      dictionaryForm: '見る',
      reading: 'ミナカッタ',
      joinsInflection: true
    })
    expect(surfaces(joined.children)).toEqual(['見', 'なかっ', 'た'])
    expect(period.joinsInflection).toBe(false)
  })

  test('joins て and a helper verb after it, and a na-adjective stem with な', () => {
    const candidates = kuromojiCandidates(
      '見ている静かな',
      tokens([
        ['見', '動詞', '自立', '見る'],
        ['て', '助詞', '接続助詞', 'て'],
        ['いる', '動詞', '非自立', 'いる'],
        ['静か', '名詞', '形容動詞語幹', '静か'],
        ['な', '助動詞', '*', 'だ']
      ])
    ) as MorphologyCandidate[]
    expect(surfaces(groupInflections(candidates))).toEqual(['見ている', '静かな'])
  })

  test('leaves a predicate copula after a na-adjective stem apart', () => {
    const candidates = kuromojiCandidates(
      '明らかだ',
      tokens([
        ['明らか', '名詞', '形容動詞語幹', '明らか'],
        ['だ', '助動詞', '*', 'だ']
      ])
    ) as MorphologyCandidate[]
    expect(surfaces(groupInflections(candidates))).toEqual(['明らか', 'だ'])
  })
})

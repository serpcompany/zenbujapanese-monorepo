import { describe, expect, test } from 'vitest'
import {
  groupInflections,
  type KuromojiToken,
  kuromojiCandidates,
  type MorphologyCandidate
} from './morphology'

function tokens(
  pieces: [surface: string, pos: string, posDetail: string, basicForm: string, reading?: string][]
): KuromojiToken[] {
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

type Piece = [surface: string, dictionaryForm: string, partOfSpeech: string[]]

const candidate = ([surface, dictionaryForm, partOfSpeech]: Piece): MorphologyCandidate => ({
  surface,
  dictionaryForm,
  normalizedForm: dictionaryForm,
  reading: surface,
  partOfSpeech,
  isOutOfVocabulary: false,
  children: [],
  joinsInflection: false
})

const grouped = (pieces: Piece[]) => groupInflections(pieces.map(candidate))
const joinedSurfaces = (pieces: Piece[]) => surfaces(grouped(pieces))

describe('groupInflections over any analyzer’s words', () => {
  const ipadicStem: Piece = ['静か', '静か', ['名詞', '形容動詞語幹']]
  const unidicStem: Piece = ['静か', '静か', ['形状詞', '一般']]
  const see: Piece = ['見', '見る', ['動詞', '自立']]
  const te: Piece = ['て', 'て', ['助詞', '接続助詞']]

  test('a verb joins its auxiliaries between the words around it', () => {
    expect(
      joinedSurfaces([
        ['時計', '時計', ['名詞', '一般']],
        ['、', '、', ['記号', '読点']],
        see,
        ['なかっ', 'ない', ['助動詞']],
        ['た', 'た', ['助動詞']],
        ['の', 'の', ['助詞', '終助詞']]
      ])
    ).toEqual(['時計', '、', '見なかった', 'の'])
  })

  test('na-adjective stems join な, で, or に, but not the copula', () => {
    const person: Piece = ['人', '人', ['名詞', '一般']]
    expect(joinedSurfaces([ipadicStem, ['な', 'だ', ['助動詞']], person])).toEqual(['静かな', '人'])
    expect(joinedSurfaces([ipadicStem, ['に', 'に', ['助詞', '副詞化']]])).toEqual(['静かに'])
    expect(joinedSurfaces([ipadicStem, ['で', 'だ', ['助動詞']]])).toEqual(['静かで'])
    expect(joinedSurfaces([ipadicStem, ['だ', 'だ', ['助動詞']]])).toEqual(['静か', 'だ'])
    expect(
      joinedSurfaces([ipadicStem, ['でし', 'です', ['助動詞']], ['た', 'た', ['助動詞']]])
    ).toEqual(['静か', 'でし', 'た'])
    expect(joinedSurfaces([unidicStem, ['な', 'だ', ['助動詞']]])).toEqual(['静かな'])
    expect(joinedSurfaces([unidicStem, ['に', 'だ', ['助動詞']]])).toEqual(['静かに'])
    expect(
      joinedSurfaces([
        ['学生', '学生', ['名詞', '一般']],
        ['な', 'だ', ['助動詞']]
      ])
    ).toEqual(['学生', 'な'])
  })

  test('adjectives, conditionals, and voiced te-forms join', () => {
    expect(
      joinedSurfaces([
        ['高く', '高い', ['形容詞', '自立']],
        ['なかっ', 'ない', ['助動詞']],
        ['た', 'た', ['助動詞']]
      ])
    ).toEqual(['高くなかった'])
    expect(
      joinedSurfaces([
        ['見れ', '見る', ['動詞', '自立']],
        ['ば', 'ば', ['助詞', '接続助詞']]
      ])
    ).toEqual(['見れば'])
    expect(
      joinedSurfaces([
        ['読ん', '読む', ['動詞', '自立']],
        ['で', 'で', ['助詞', '接続助詞']],
        ['いる', 'いる', ['動詞', '非自立']]
      ])
    ).toEqual(['読んでいる'])
  })

  test('an independent verb after a te-form starts a new word', () => {
    expect(joinedSurfaces([see, te, ['帰る', '帰る', ['動詞', '自立']]])).toEqual(['見て', '帰る'])
  })

  test('only joined words are marked as joined inflections', () => {
    expect(
      grouped([
        ['本', '本', ['名詞', '一般']],
        ['しまっ', 'しまう', ['動詞', '自立']],
        ['た', 'た', ['助動詞']]
      ]).map(word => word.joinsInflection)
    ).toEqual([false, true])
  })

  test('te-form, helper verbs, and suffix verbs join; other words stay separate', () => {
    expect(
      joinedSurfaces([see, te, ['い', 'いる', ['動詞', '非自立']], ['ない', 'ない', ['助動詞']]])
    ).toEqual(['見ていない'])
    expect(
      joinedSurfaces([
        see,
        ['させ', 'させる', ['動詞', '接尾']],
        ['られる', 'られる', ['動詞', '接尾']]
      ])
    ).toEqual(['見させられる'])
    expect(
      joinedSurfaces([
        see,
        ['ない', 'ない', ['助動詞']],
        ['よう', 'よう', ['名詞', '非自立']],
        ['に', 'に', ['助詞', '副詞化']]
      ])
    ).toEqual(['見ない', 'よう', 'に'])
    expect(
      joinedSurfaces([
        ['学生', '学生', ['名詞', '一般']],
        ['だ', 'だ', ['助動詞']]
      ])
    ).toEqual(['学生', 'だ'])
    expect(
      joinedSurfaces([
        see,
        ['が', 'が', ['助詞', '接続助詞']],
        ['いる', 'いる', ['動詞', '非自立']]
      ])
    ).toEqual(['見', 'が', 'いる'])
  })
})

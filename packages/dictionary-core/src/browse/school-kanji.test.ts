import { describe, expect, test } from 'vitest'
import { kanjiEntries, kanjiListResponse } from '../artifact/browse-kanji'
import type { KanjiReferenceEntry, KanjiReferenceFile } from '../artifact/kanji-data'
import { SchoolKanji } from './school-kanji'

const kanji = (
  character: string,
  grade: number | null,
  frequencyRank: number | null,
  meanings: string,
  readings = '',
  name = ''
): KanjiReferenceEntry => ({
  character,
  strokeCount: 4,
  grade,
  wallerJlptLevel: null,
  frequencyRank,
  meanings: meanings ? meanings.split(',') : [],
  readings: [
    ...readings
      .split(' ')
      .filter(Boolean)
      .map(value => ({
        value,
        kind: /^[ァ-ヶ]/u.test(value) ? ('on' as const) : ('kun' as const)
      })),
    ...(name ? [{ value: name, kind: 'name' as const }] : [])
  ],
  components: []
})

const file: KanjiReferenceFile = {
  metadataSourceIdentity: 'edrdg.kanjidic2',
  componentSourceIdentity: 'edrdg.kradfile',
  entries: [
    kanji('木', 1, 317, 'tree,wood,counter for (long) things', 'ボク き こ-'),
    kanji('水', 1, 223, 'water', 'スイ みず'),
    kanji('日', 1, 1, 'day,sun,Japan', 'ニチ ジツ ひ -び'),
    kanji('学', 1, 63, 'study,learning', 'ガク まな.ぶ', 'たかし'),
    kanji('海', 2, 200, 'sea,ocean,sea-going', 'カイ うみ'),
    kanji('亜', 8, 1509, 'Asia,rank next', 'ア'),
    kanji('丑', 9, null, 'sign of the ox', 'うし'),
    kanji('㐂', null, null, 'joy')
  ]
}

const entries = kanjiEntries(file)
const school = new SchoolKanji(entries)
const withCompatibilityKanji = new SchoolKanji(
  kanjiEntries({
    ...file,
    entries: [
      ...file.entries,
      kanji('\u{732A}', 9, 1684, 'boar', 'チョ いのしし'),
      kanji('\u{FA16}', 9, null, 'pig', 'チョ'),
      kanji('\u{FA45}', 9, null, '', 'カイ')
    ]
  })
)
const shown = (filter: string, known: string[] = [], from = school) =>
  from
    .panel({ filter, known })
    .sections.map(({ id, count, kanji }) => [id, count, kanji.map(tile => tile.character).join('')])
const shownWithCompatibilityKanji = (filter: string) => shown(filter, [], withCompatibilityKanji)

describe('the school kanji the app’s Grade panel lists', () => {
  test('lists each grade’s kanji and meanings as the website’s kanji list does', () => {
    const panel = school.panel({ filter: '', known: [] })
    expect(panel.filtered).toBe(false)
    expect(panel.sections.map(section => section.title)).toEqual([
      'Grade 1',
      'Grade 2',
      'Secondary school',
      'Jinmeiyō'
    ])
    for (const section of panel.sections) {
      expect(section.kanji.map(({ character, meaning }) => ({ character, meaning }))).toEqual(
        kanjiListResponse(entries, section.id)?.kanji
      )
    }
    expect(shown('')[0]).toEqual(['grade-1', '4', '日学水木'])
  })

  test('narrows every grade at once by an English meaning, from the start of a word', () => {
    expect(shown('Water')).toEqual([['grade-1', '1 of 4', '水']])
    expect(shown('ocean')).toEqual([['grade-2', '1 of 1', '海']])
    expect(shown('next')).toEqual([['secondary-school', '1 of 1', '亜']])
    expect(shown('ater')).toEqual([])
    expect(shown('long')).toEqual([['grade-1', '1 of 4', '木']])
    expect(shown('going')).toEqual([['grade-2', '1 of 1', '海']])
  })

  test('narrows by a reading in either kana, without names or okurigana marks', () => {
    expect(shown('みず')).toEqual([['grade-1', '1 of 4', '水']])
    expect(shown('ミズ')).toEqual([['grade-1', '1 of 4', '水']])
    expect(shown('じつ')).toEqual([['grade-1', '1 of 4', '日']])
    expect(shown('まなぶ')).toEqual([['grade-1', '1 of 4', '学']])
    expect(shown('う')).toEqual([
      ['grade-2', '1 of 1', '海'],
      ['jinmeiyo', '1 of 1', '丑']
    ])
    expect(shown('たかし')).toEqual([])
  })

  test('narrows to the kanji the filter is written with', () => {
    expect(shown('海水')).toEqual([
      ['grade-1', '1 of 4', '水'],
      ['grade-2', '1 of 1', '海']
    ])
    expect(shown('日本')).toEqual([['grade-1', '1 of 4', '日']])
  })

  test('finds a compatibility kanji by the kanji, typed or pasted in either form', () => {
    const sea = [
      ['grade-2', '1 of 1', '海'],
      ['jinmeiyo', '1 of 4', '\u{FA45}']
    ]
    expect(shownWithCompatibilityKanji('\u{FA45}')).toEqual(sea)
    expect(shownWithCompatibilityKanji('\u{6D77}')).toEqual(sea)
    expect(shownWithCompatibilityKanji('\u{732A}')).toEqual([
      ['jinmeiyo', '2 of 4', '\u{732A}\u{FA16}']
    ])
    expect(shownWithCompatibilityKanji('\u{FA16}')).toEqual([
      ['jinmeiyo', '2 of 4', '\u{732A}\u{FA16}']
    ])
  })

  test('finds a compatibility kanji with no meanings of its own by the meaning its tile shows', () => {
    const jinmeiyo = withCompatibilityKanji.panel({ filter: '', known: [] }).sections.at(-1)
    expect(jinmeiyo?.kanji.find(tile => tile.character === '\u{FA45}')?.meaning).toBe('sea')
    expect(shownWithCompatibilityKanji('sea')).toEqual([
      ['grade-2', '1 of 1', '海'],
      ['jinmeiyo', '1 of 4', '\u{FA45}']
    ])
    expect(shownWithCompatibilityKanji('pig')).toEqual([['jinmeiyo', '1 of 4', '\u{FA16}']])
    expect(shownWithCompatibilityKanji('boar')).toEqual([['jinmeiyo', '1 of 4', '\u{732A}']])
  })

  test('marks the known kanji and counts them in each grade’s header', () => {
    const [first, second] = school.panel({ filter: '', known: ['日', '水', '海'] }).sections
    expect(first?.kanji.map(tile => tile.known)).toEqual([true, false, true, false])
    expect([first?.known, first?.spoken]).toEqual([2, 'Grade 1, 4 kanji, 2 known'])
    expect([second?.known, second?.spoken]).toEqual([1, 'Grade 2, 1 kanji, 1 known'])
    const [filtered] = school.panel({ filter: 'sun', known: ['水'] }).sections
    expect([filtered?.known, filtered?.spoken]).toEqual([0, 'Grade 1, 1 of 4 kanji'])
  })
})

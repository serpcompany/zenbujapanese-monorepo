import { describe, expect, test } from 'vitest'
import { type ChartGroup, chartKanaCount, conversionChart } from './chart'
import type { ConverterSlug } from './paths'
import { entriesIn, kanaGroups } from './reference'
import { romajiToKana } from './romaji-to-kana'

const group = (slug: ConverterSlug, id: ChartGroup['id']) => {
  const found = conversionChart(slug).groups.find(candidate => candidate.id === id)
  if (!found) throw new Error(`No ${id} group`)
  return found
}

const columns = (slug: ConverterSlug, id: ChartGroup['id']) =>
  group(slug, id).rows.map(row => row.cells.map(cell => cell?.kana ?? null))

const tilesOf = (chartGroup: ChartGroup) =>
  chartGroup.rows.flatMap(row => row.cells.flatMap(cell => (cell ? [cell] : [])))

describe('the conversion chart', () => {
  test('has every one of the 131 kana, in five groups with short tab names', () => {
    expect(chartKanaCount).toBe(131)
    const groups = conversionChart('hiragana-to-katakana').groups
    expect(groups.map(each => [each.tab, each.label, each.count, tilesOf(each).length])).toEqual([
      ['Basic', 'Basic', 46, 46],
      ['Marks', 'With marks', 25, 25],
      ['Combos', 'Combinations', 33, 33],
      ['Small', 'Small kana', 10, 10],
      ['Katakana', 'Katakana only', 17, 17]
    ])
  })

  test('lays each group out like the kana chart, a sound in each place and gaps where there is none', () => {
    const basic = columns('hiragana-to-katakana', 'basic')
    expect(basic).toHaveLength(11)
    expect(basic[1]).toEqual(['か カ', 'き キ', 'く ク', 'け ケ', 'こ コ'])
    expect(basic[7]).toEqual(['や ヤ', null, 'ゆ ユ', null, 'よ ヨ'])
    expect(basic[10]).toEqual(['ん ン', null, null, null, null])
    expect(group('hiragana-to-katakana', 'combinations').sounds).toBe(3)
    expect(columns('hiragana-to-katakana', 'combinations')[1]).toEqual([
      'しゃ シャ',
      'しゅ シュ',
      'しょ ショ'
    ])
    expect(columns('hiragana-to-katakana', 'small')).toEqual([
      ['ぁ ァ', 'ぃ ィ', 'ぅ ゥ', 'ぇ ェ', 'ぉ ォ'],
      [null, null, 'っ ッ', null, null],
      ['ゃ ャ', null, 'ゅ ュ', null, 'ょ ョ'],
      ['ゎ ヮ', null, null, null, null]
    ])
    expect(columns('katakana-to-hiragana', 'extended').slice(0, 2)).toEqual([
      ['ヴァ ゔぁ', 'ヴィ ゔぃ', 'ヴ ゔ', 'ヴェ ゔぇ', 'ヴォ ゔぉ'],
      ['ファ ふぁ', 'フィ ふぃ', null, 'フェ ふぇ', 'フォ ふぉ']
    ])
  })

  test('each page’s pair runs in its direction, with the romaji under it', () => {
    const ka = (slug: ConverterSlug) => group(slug, 'basic').rows[1].cells[0]
    expect(ka('hiragana-to-katakana')).toEqual({ kana: 'か カ', romaji: 'ka' })
    expect(ka('katakana-to-hiragana')?.kana).toBe('カ か')
    expect(ka('half-width-to-full-width')?.kana).toBe('ｶ カ')
    expect(ka('full-width-to-half-width')?.kana).toBe('カ ｶ')
    const shi = (slug: ConverterSlug) => group(slug, 'basic').rows[2].cells[1]?.romaji
    expect(shi('kana-to-romaji')).toBe('shi, si')
    expect(shi('hiragana-to-katakana')).toBe('shi')
  })

  test('every spelling on Romaji to Kana types the kana it sits under', () => {
    const groups = conversionChart('romaji-to-kana').groups
    const pairs = groups.flatMap((each, index) =>
      tilesOf(each).map((tile, at) => ({
        kana: entriesIn(kanaGroups[index])[at].kana,
        romaji: tile.romaji
      }))
    )
    expect(pairs).toHaveLength(131)
    for (const { kana, romaji } of pairs) {
      for (const spelling of romaji.split(', ')) expect(romajiToKana(spelling), spelling).toBe(kana)
    }
  })

  test('the small っ reads as a doubled consonant, and on Kana to Romaji as its typed spellings', () => {
    const smallTsu = (slug: ConverterSlug) => group(slug, 'small').rows[1].cells[2]?.romaji
    expect(smallTsu('hiragana-to-katakana')).toBe('doubled consonant')
    expect(smallTsu('kana-to-romaji')).toBe('xtsu, xtu, ltu')
  })

  test('the width pages call the last group extended katakana', () => {
    expect(group('full-width-to-half-width', 'extended').label).toBe('Extended katakana')
  })
})

import { describe, expect, test } from 'vitest'
import type { ConverterSlug } from './paths'
import { kanaGroups } from './reference'
import { romajiToKana } from './romaji-to-kana'
import { conversionTable, tableRowCount } from './table'

type Group = ReturnType<typeof conversionTable>['groups'][number]

const entriesOf = (group: Group) =>
  group.kind === 'chart'
    ? group.rows.flatMap(row =>
        row.cells.flatMap(cell =>
          cell.entry ? [{ kana: cell.entry.kana, romaji: cell.entry.romaji }] : []
        )
      )
    : group.rows.map(row => ({ kana: row.kana, romaji: row.cells[2].text }))

const group = (slug: ConverterSlug, id: Group['id']) => {
  const found = conversionTable(slug).groups.find(candidate => candidate.id === id)
  if (!found) throw new Error(`No ${id} group`)
  return found
}

describe('the conversion table', () => {
  test('has every one of the 131 kana, in five groups with short tab names', () => {
    expect(tableRowCount).toBe(131)
    const groups = conversionTable('hiragana-to-katakana').groups
    expect(groups.map(each => [each.tab, each.label, each.count, entriesOf(each).length])).toEqual(
      kanaGroups.map(each => [each.tab, each.label, each.rows.length, each.rows.length])
    )
    expect(groups.map(each => each.tab)).toEqual(['Basic', 'Marks', 'Combos', 'Small', 'Katakana'])
  })

  test('lays Basic and Marks out as a chart by vowel, with gaps, and Combos by ya, yu, and yo', () => {
    const basic = group('hiragana-to-katakana', 'basic')
    if (basic.kind !== 'chart') throw new Error('Basic is a chart')
    expect(basic.headings).toEqual(['a', 'i', 'u', 'e', 'o'])
    expect(basic.rows.map(row => row.label)).toEqual([
      'a',
      'ka',
      'sa',
      'ta',
      'na',
      'ha',
      'ma',
      'ya',
      'ra',
      'wa',
      'n'
    ])
    const ya = basic.rows[7].cells.map(cell => cell.entry?.pair ?? null)
    expect(ya).toEqual(['や ヤ', null, 'ゆ ユ', null, 'よ ヨ'])
    expect(basic.rows[1].cells[0].entry).toEqual({ kana: 'か', pair: 'か カ', romaji: 'ka' })
    const combinations = group('hiragana-to-katakana', 'combinations')
    if (combinations.kind !== 'chart') throw new Error('Combos is a chart')
    expect(combinations.headings).toEqual(['ya', 'yu', 'yo'])
    expect(combinations.rows[1].label).toBe('shi')
  })

  test('each page’s pair runs in its direction', () => {
    const firstPair = (slug: ConverterSlug) => {
      const basic = group(slug, 'basic')
      return basic.kind === 'chart' ? basic.rows[1].cells[0].entry?.pair : null
    }
    expect(firstPair('katakana-to-hiragana')).toBe('カ か')
    expect(firstPair('half-width-to-full-width')).toBe('ｶ カ')
    expect(firstPair('full-width-to-half-width')).toBe('カ ｶ')
    const small = group('kana-to-romaji', 'small')
    expect(small.kind === 'list' && small.columns.map(column => column.heading)).toEqual([
      'Hiragana',
      'Katakana',
      'Romaji'
    ])
  })

  test('every spelling on Romaji to Kana types the kana it sits beside', () => {
    const groups = conversionTable('romaji-to-kana').groups
    const entries = groups.flatMap(entriesOf)
    expect(entries).toHaveLength(131)
    for (const { kana, romaji } of entries) {
      for (const spelling of romaji.split(', ')) expect(romajiToKana(spelling), spelling).toBe(kana)
    }
  })

  test('a romaji cell in English words is tagged as English', () => {
    const small = group('hiragana-to-katakana', 'small')
    const smallTsu = small.kind === 'list' ? small.rows.find(row => row.kana === 'っ') : undefined
    expect(smallTsu?.cells[2]).toEqual({ text: 'doubled consonant', lang: 'en' })
  })

  test('the width pages call the last group extended katakana', () => {
    expect(group('full-width-to-half-width', 'extended').label).toBe('Extended katakana')
  })
})

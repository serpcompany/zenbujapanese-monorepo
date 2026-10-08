import { expect, test } from 'vitest'
import { kanaGroups } from './reference'
import { conversionTable, tableRowCount } from './table'

const firstRows = (slug: Parameters<typeof conversionTable>[0]) =>
  conversionTable(slug).groups.map(group => group.rows[0])

test('every direction’s table has all 131 rows, grouped', () => {
  expect(tableRowCount).toBe(131)
  const groups = conversionTable('hiragana-to-katakana').groups
  expect(groups.map(group => [group.label, group.rows.length])).toEqual(
    kanaGroups.map(group => [group.label, group.rows.length])
  )
  for (const group of groups) {
    for (const row of group.rows) expect(row).toHaveLength(3)
  }
})

test('its columns run in the page’s direction', () => {
  const headings = (slug: Parameters<typeof conversionTable>[0]) =>
    conversionTable(slug).columns.map(column => column.heading)
  expect(headings('hiragana-to-katakana')).toEqual(['Hiragana', 'Katakana', 'Romaji'])
  expect(headings('katakana-to-hiragana')).toEqual(['Katakana', 'Hiragana', 'Romaji'])
  expect(headings('romaji-to-kana')).toEqual(['Romaji', 'Hiragana', 'Katakana', 'Also typed as'])
  expect(headings('kana-to-romaji')).toEqual(['Hiragana', 'Katakana', 'Romaji', 'Other spellings'])
  expect(headings('half-width-to-full-width')).toEqual(['Half-width', 'Full-width', 'Romaji'])
  expect(headings('full-width-to-half-width')).toEqual(['Full-width', 'Half-width', 'Romaji'])
})

test('each row converts its kana for the page', () => {
  expect(firstRows('katakana-to-hiragana')[0]).toEqual(['ア', 'あ', 'a'])
  expect(firstRows('romaji-to-kana')[1]).toEqual(['ga', 'が', 'ガ', ''])
  expect(firstRows('kana-to-romaji')[3]).toEqual(['ぁ', 'ァ', 'a', 'xa, la'])
  expect(firstRows('half-width-to-full-width')[1]).toEqual(['ｶﾞ', 'ガ', 'ga'])
  expect(firstRows('full-width-to-half-width')[4]).toEqual(['ヴ', 'ｳﾞ', 'vu'])
})

test('the width pages call the last group extended katakana', () => {
  expect(conversionTable('full-width-to-half-width').groups.at(-1)?.label).toBe('Extended katakana')
})

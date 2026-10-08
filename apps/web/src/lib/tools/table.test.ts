import { expect, test } from 'vitest'
import { kanaGroups } from './reference'
import { romajiToKana } from './romaji-to-kana'
import { conversionTable, tableRowCount } from './table'

const firstRows = (slug: Parameters<typeof conversionTable>[0]) =>
  conversionTable(slug).groups.map(group => group.rows[0].map(cell => cell.text))

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

test('every row of Romaji to Kana’s table types the kana beside it, and so does each other spelling', () => {
  const rows = conversionTable('romaji-to-kana').groups.flatMap(group => group.rows)
  expect(rows).toHaveLength(131)
  for (const [typed, kana, , also] of rows) {
    expect(romajiToKana(typed.text), typed.text).toBe(kana.text)
    for (const spelling of also.text.split(', ').filter(Boolean)) {
      expect(romajiToKana(spelling), spelling).toBe(kana.text)
    }
  }
})

test('a romaji cell in English words is tagged as English', () => {
  const small = conversionTable('hiragana-to-katakana').groups.find(group => group.id === 'small')
  const smallTsu = small?.rows.find(([hiragana]) => hiragana.text === 'っ')
  expect(smallTsu?.[2]).toEqual({ text: 'doubled consonant', lang: 'en' })
})

test('the width pages call the last group extended katakana', () => {
  expect(conversionTable('full-width-to-half-width').groups.at(-1)?.label).toBe('Extended katakana')
})

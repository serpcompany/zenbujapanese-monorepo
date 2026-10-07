import { describe, expect, test } from 'vitest'
import { chartKana, dakuonRows, gojuonRows, inScript, kanaScriptOf } from './kana'

describe('kanaScriptOf, the script a reading is browsed under', () => {
  test.each([
    ['かがく', 'hiragana'],
    ['ゔ', 'hiragana'],
    ['ゝ', 'hiragana'],
    ['カメラ', 'katakana'],
    ['ヴァイオリン', 'katakana'],
    ['ー', 'katakana'],
    ['〜', 'katakana'],
    ['ﾀﾋ', 'katakana']
  ])('browses %s under %s, so every reading has a script', (reading, script) => {
    expect(kanaScriptOf(reading)).toBe(script)
  })
})

describe('the kana charts', () => {
  const kana = (rows: typeof gojuonRows) =>
    rows.flatMap(row => row.cells.flatMap(cell => (cell ? [cell] : [])))

  test('hold the 46 gojūon and 25 dakuon and handakuon kana, with romaji', () => {
    expect(kana(gojuonRows)).toHaveLength(46)
    expect(kana(dakuonRows)).toHaveLength(25)
    expect(kana(gojuonRows)[1]).toEqual({ kana: 'い', romaji: 'i' })
    expect(chartKana('hiragana').size).toBe(71)
  })

  test('draw katakana from the same rows', () => {
    const [first] = inScript(gojuonRows, 'katakana')
    expect(first.cells.map(cell => cell?.kana)).toEqual(['ア', 'イ', 'ウ', 'エ', 'オ'])
    expect(chartKana('katakana').has('ヲ')).toBe(true)
  })
})

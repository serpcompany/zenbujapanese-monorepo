import { describe, expect, test } from 'vitest'
import { kanaToRomaji } from './kana-to-romaji'
import { kanaChartTabs, kanaGroups } from './reference'
import { romajiToKana } from './romaji-to-kana'

const everyRow = kanaGroups.flatMap(group => group.rows)

describe('the kana reference', () => {
  test('has 131 rows in five groups', () => {
    expect(kanaGroups.map(group => [group.label, group.rows.length])).toEqual([
      ['Basic', 46],
      ['With marks', 25],
      ['Combinations', 33],
      ['Small kana', 10],
      ['Katakana only', 17]
    ])
    expect(everyRow).toHaveLength(131)
  })

  test('spells the kana in Hepburn, as the kana to romaji converter does', () => {
    const spelled = (id: string) =>
      kanaGroups
        .find(group => group.id === id)
        ?.rows.map(row => row.romaji)
        .join(' ')
    expect(spelled('basic')).toBe(
      'a i u e o ka ki ku ke ko sa shi su se so ta chi tsu te to na ni nu ne no ha hi fu he ho ma mi mu me mo ya yu yo ra ri ru re ro wa o n'
    )
    expect(spelled('marks')).toContain('za ji zu ze zo da ji zu de do')
    expect(spelled('combinations')).toContain('sha shu sho cha chu cho')
    for (const row of everyRow.filter(row => row.kana !== 'っ')) {
      expect(row.romaji, row.kana).toBe(kanaToRomaji(row.kana))
    }
  })

  test('every other spelling it lists types its kana', () => {
    const typed = everyRow.flatMap(row =>
      row.otherSpellings.map(spelling => [row.kana, romajiToKana(spelling)])
    )
    expect(typed.length).toBeGreaterThan(30)
    for (const [kana, result] of typed) expect(result).toBe(kana)
  })

  test('every kana has a spelling that types it, and its other typed spellings type it too', () => {
    for (const row of everyRow) {
      expect(row.typed, row.kana).not.toBe('')
      for (const spelling of [row.typed, ...row.alsoTyped]) {
        expect(romajiToKana(spelling), spelling).toBe(row.kana)
      }
    }
    const typedFor = (kana: string) => everyRow.find(row => row.kana === kana)?.typed
    expect(['を', 'ぢ', 'づ', 'ぁ', 'っ', 'てぃ', 'でぃ', 'うぉ'].map(typedFor)).toEqual([
      'wo',
      'di',
      'du',
      'xa',
      'xtsu',
      'thi',
      'dhi',
      'who'
    ])
  })

  test('lays the basic chart out in rows of five, with gaps where a kana is missing', () => {
    const [basic] = kanaChartTabs
    expect(basic.cells.map(cell => cell.position)).toEqual([...Array(55).keys()])
    expect(basic.cells.slice(35, 40).map(cell => cell.row?.kana ?? null)).toEqual([
      'や',
      null,
      'ゆ',
      null,
      'よ'
    ])
    expect(kanaChartTabs.map(tab => [tab.label, tab.cells.length, tab.columns])).toEqual([
      ['Basic', 55, 5],
      ['With marks', 25, 5],
      ['Combinations', 33, 3]
    ])
  })
})

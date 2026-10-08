import {
  type KanaRow as ChartRow,
  dakuonRows,
  gojuonRows
} from '@zenbu/dictionary-core/browse/kana'
import { kanaToRomaji } from './kana-to-romaji'
import { romajiToKana } from './romaji-to-kana'

export interface KanaRow {
  kana: string
  romaji: string
  romajiInWords?: true
  typed: string
  alsoTyped: readonly string[]
  otherSpellings: readonly string[]
}

const otherTyping: Readonly<Record<string, readonly string[]>> = {
  し: ['si'],
  ち: ['ti'],
  つ: ['tu'],
  ふ: ['hu'],
  を: ['wo'],
  ん: ['nn'],
  じ: ['zi'],
  ぢ: ['di'],
  づ: ['du'],
  しゃ: ['sya'],
  しゅ: ['syu'],
  しょ: ['syo'],
  ちゃ: ['tya', 'cya'],
  ちゅ: ['tyu', 'cyu'],
  ちょ: ['tyo', 'cyo'],
  じゃ: ['jya', 'zya'],
  じゅ: ['jyu', 'zyu'],
  じょ: ['jyo', 'zyo'],
  ぁ: ['xa', 'la'],
  ぃ: ['xi', 'li'],
  ぅ: ['xu', 'lu'],
  ぇ: ['xe', 'le'],
  ぉ: ['xo', 'lo'],
  ゃ: ['xya', 'lya'],
  ゅ: ['xyu', 'lyu'],
  ょ: ['xyo', 'lyo'],
  っ: ['xtsu', 'xtu', 'ltu'],
  ゎ: ['xwa', 'lwa'],
  てぃ: ['thi'],
  でぃ: ['dhi'],
  うぉ: ['who'],
  しぇ: ['sye'],
  ちぇ: ['tye'],
  じぇ: ['zye']
}

const smallTsu = 'っ'
const smallTsuInWords = 'doubled consonant'

function kanaRow(kana: string): KanaRow {
  const otherSpellings = otherTyping[kana] ?? []
  const romaji = kana === smallTsu ? smallTsuInWords : kanaToRomaji(kana)
  const [typed = '', ...alsoTyped] = [romaji, ...otherSpellings].filter(
    spelling => romajiToKana(spelling) === kana
  )
  return {
    kana,
    romaji,
    ...(kana === smallTsu ? { romajiInWords: true } : {}),
    typed,
    alsoTyped,
    otherSpellings
  }
}

interface KanaChart {
  headings: readonly string[]
  rows: readonly { label: string; cells: readonly (KanaRow | null)[] }[]
}

const vowelHeadings = ['a', 'i', 'u', 'e', 'o']

const chartOf = (rows: readonly ChartRow[]): KanaChart => ({
  headings: vowelHeadings,
  rows: rows.map(row => ({
    label: kanaToRomaji(row.cells.find(cell => cell !== null)?.kana ?? ''),
    cells: row.cells.map(cell => (cell ? kanaRow(cell.kana) : null))
  }))
})

const combinationChart: KanaChart = {
  headings: ['ya', 'yu', 'yo'],
  rows: ['き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'び', 'ぴ'].map(kana => ({
    label: kanaToRomaji(kana),
    cells: ['ゃ', 'ゅ', 'ょ'].map(small => kanaRow(kana + small))
  }))
}

const rowsOf = (chart: KanaChart) =>
  chart.rows.flatMap(row => row.cells.flatMap(cell => (cell ? [cell] : [])))

const basicChart = chartOf(gojuonRows)
const markChart = chartOf(dakuonRows)

const smallRows = Array.from('ぁぃぅぇぉゃゅょっゎ', kanaRow)

const extendedRows = [
  'ゔ',
  'ふぁ',
  'ふぃ',
  'ふぇ',
  'ふぉ',
  'てぃ',
  'でぃ',
  'うぃ',
  'うぇ',
  'うぉ',
  'しぇ',
  'ちぇ',
  'じぇ',
  'ゔぁ',
  'ゔぃ',
  'ゔぇ',
  'ゔぉ'
].map(kanaRow)

export type KanaGroupId = 'basic' | 'marks' | 'combinations' | 'small' | 'extended'

export interface KanaGroup {
  id: KanaGroupId
  tab: string
  label: string
  rows: readonly KanaRow[]
  chart?: KanaChart
}

export const kanaGroups: readonly KanaGroup[] = [
  { id: 'basic', tab: 'Basic', label: 'Basic', rows: rowsOf(basicChart), chart: basicChart },
  { id: 'marks', tab: 'Marks', label: 'With marks', rows: rowsOf(markChart), chart: markChart },
  {
    id: 'combinations',
    tab: 'Combos',
    label: 'Combinations',
    rows: rowsOf(combinationChart),
    chart: combinationChart
  },
  { id: 'small', tab: 'Small', label: 'Small kana', rows: smallRows },
  { id: 'extended', tab: 'Katakana', label: 'Katakana only', rows: extendedRows }
]

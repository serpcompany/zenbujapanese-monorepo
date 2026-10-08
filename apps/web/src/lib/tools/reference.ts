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

const rowsOf = (chart: readonly ChartRow[]) =>
  chart.flatMap(row => row.cells.flatMap(cell => (cell ? [kanaRow(cell.kana)] : [])))

const combinationRows = ['き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'び', 'ぴ'].flatMap(
  kana => ['ゃ', 'ゅ', 'ょ'].map(small => kanaRow(kana + small))
)

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
  label: string
  rows: readonly KanaRow[]
}

export const kanaGroups: readonly KanaGroup[] = [
  { id: 'basic', label: 'Basic', rows: rowsOf(gojuonRows) },
  { id: 'marks', label: 'With marks', rows: rowsOf(dakuonRows) },
  { id: 'combinations', label: 'Combinations', rows: combinationRows },
  { id: 'small', label: 'Small kana', rows: smallRows },
  { id: 'extended', label: 'Katakana only', rows: extendedRows }
]

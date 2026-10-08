import { kanaToRomaji } from './kana-to-romaji'

export interface KanaRow {
  kana: string
  romaji: string
  also?: string
}

const otherTyping: Readonly<Record<string, string>> = {
  し: 'si',
  ち: 'ti',
  つ: 'tu',
  ふ: 'hu',
  を: 'wo',
  ん: 'nn',
  じ: 'zi',
  ぢ: 'di',
  づ: 'du',
  しゃ: 'sya',
  しゅ: 'syu',
  しょ: 'syo',
  ちゃ: 'tya, cya',
  ちゅ: 'tyu, cyu',
  ちょ: 'tyo, cyo',
  じゃ: 'jya, zya',
  じゅ: 'jyu, zyu',
  じょ: 'jyo, zyo',
  ぁ: 'xa, la',
  ぃ: 'xi, li',
  ぅ: 'xu, lu',
  ぇ: 'xe, le',
  ぉ: 'xo, lo',
  ゃ: 'xya, lya',
  ゅ: 'xyu, lyu',
  ょ: 'xyo, lyo',
  っ: 'xtu, ltu',
  ゎ: 'xwa, lwa',
  てぃ: 'thi',
  でぃ: 'dhi',
  しぇ: 'sye',
  ちぇ: 'tye',
  じぇ: 'zye'
}

const spellingOfSmallTsu = 'doubles the next consonant'

function kanaRow(kana: string): KanaRow {
  const romaji = kana === 'っ' ? spellingOfSmallTsu : kanaToRomaji(kana)
  const also = otherTyping[kana]
  return also ? { kana, romaji, also } : { kana, romaji }
}

interface KanaChartCell {
  position: number
  row: KanaRow | null
}

const inPlace = (rows: readonly (KanaRow | null)[]): KanaChartCell[] =>
  rows.map((row, position) => ({ position, row }))

const chart = (rows: readonly string[]) =>
  inPlace(rows.flatMap(row => Array.from(row, kana => (kana === '_' ? null : kanaRow(kana)))))

const rowsOf = (cells: readonly KanaChartCell[]) =>
  cells.flatMap(cell => (cell.row ? [cell.row] : []))

const basicChart = chart([
  'あいうえお',
  'かきくけこ',
  'さしすせそ',
  'たちつてと',
  'なにぬねの',
  'はひふへほ',
  'まみむめも',
  'や_ゆ_よ',
  'らりるれろ',
  'わ___を',
  'ん____'
])

const markChart = chart(['がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ'])

const combinationChart = inPlace(
  ['き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'び', 'ぴ'].flatMap(kana =>
    ['ゃ', 'ゅ', 'ょ'].map(small => kanaRow(kana + small))
  )
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
  { id: 'basic', label: 'Basic', rows: rowsOf(basicChart) },
  { id: 'marks', label: 'With marks', rows: rowsOf(markChart) },
  { id: 'combinations', label: 'Combinations', rows: rowsOf(combinationChart) },
  { id: 'small', label: 'Small kana', rows: smallRows },
  { id: 'extended', label: 'Katakana only', rows: extendedRows }
]

export interface KanaChartTab {
  id: Extract<KanaGroupId, 'basic' | 'marks' | 'combinations'>
  label: string
  note: string
  cells: readonly KanaChartCell[]
  columns: 3 | 5
}

export const kanaChartTabs: readonly KanaChartTab[] = [
  { id: 'basic', label: 'Basic', note: 'The 46 basic kana.', cells: basicChart, columns: 5 },
  {
    id: 'marks',
    label: 'With marks',
    note: 'Two small strokes (゛) or a circle (゜) change the sound.',
    cells: markChart,
    columns: 5
  },
  {
    id: 'combinations',
    label: 'Combinations',
    note: 'A small ゃ, ゅ, or ょ joins the kana before it.',
    cells: combinationChart,
    columns: 3
  }
]

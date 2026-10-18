import { type KanaRow as CoreRow, dakuonRows, gojuonRows } from '@zenbu/dictionary-core/browse/kana'
import { kanaToRomaji } from './kana-to-romaji'
import { romajiToKana } from './romaji-to-kana'

export interface KanaEntry {
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
const smallTsuInWords = 'double'

function kanaEntry(kana: string): KanaEntry {
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

interface KanaChartRow {
  consonant: string
  cells: readonly (KanaEntry | null)[]
}

const fromCore = (rows: readonly CoreRow[]): KanaChartRow[] =>
  rows.map(({ consonant, cells }) => ({
    consonant,
    cells: cells.map(cell => (cell ? kanaEntry(cell.kana) : null))
  }))

const gap = '_'

const chartRows = (rows: readonly string[]): KanaChartRow[] =>
  rows.map(row => {
    const cells = row.split(' ').map(kana => (kana === gap ? null : kanaEntry(kana)))
    return { consonant: cells.find(cell => cell !== null)?.romaji ?? '', cells }
  })

const combinationRows = chartRows(
  ['き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'び', 'ぴ'].map(kana =>
    ['ゃ', 'ゅ', 'ょ'].map(small => kana + small).join(' ')
  )
)

const smallRows = chartRows(['ぁ ぃ ぅ ぇ ぉ', '_ _ っ _ _', 'ゃ _ ゅ _ ょ', 'ゎ _ _ _ _'])

const extendedRows = chartRows([
  'ゔぁ ゔぃ ゔ ゔぇ ゔぉ',
  'ふぁ ふぃ _ ふぇ ふぉ',
  '_ うぃ _ うぇ うぉ',
  '_ てぃ _ _ _',
  '_ でぃ _ _ _',
  '_ _ _ しぇ _',
  '_ _ _ ちぇ _',
  '_ _ _ じぇ _'
])

export type KanaGroupId = 'basic' | 'marks' | 'combinations' | 'small' | 'extended'

export interface KanaGroup {
  id: KanaGroupId
  label: string
  sounds: 3 | 5
  rows: readonly KanaChartRow[]
}

export const kanaGroups: readonly KanaGroup[] = [
  { id: 'basic', label: 'Basic', sounds: 5, rows: fromCore(gojuonRows) },
  { id: 'marks', label: 'With marks', sounds: 5, rows: fromCore(dakuonRows) },
  { id: 'small', label: 'Small kana', sounds: 5, rows: smallRows },
  { id: 'combinations', label: 'Combinations', sounds: 3, rows: combinationRows },
  { id: 'extended', label: 'Katakana only', sounds: 5, rows: extendedRows }
]

export const entriesIn = (group: KanaGroup): KanaEntry[] =>
  group.rows.flatMap(row => row.cells.flatMap(cell => (cell ? [cell] : [])))

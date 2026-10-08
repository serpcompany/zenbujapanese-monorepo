import { type ConverterPair, converterFor } from './converters'
import { toKatakana } from './kana'
import type { ConverterSlug } from './paths'
import { type KanaGroupId, type KanaRow, kanaGroups } from './reference'
import { fullToHalf, type WidthOptions } from './width'

interface TableColumn {
  heading: string
  quiet?: true
}

interface TableCell {
  text: string
  lang: 'ja' | 'ja-Latn' | 'en'
}

interface TableGroup {
  id: KanaGroupId
  label: string
  rows: readonly (readonly TableCell[])[]
}

export interface ConversionTable {
  line: string
  columns: readonly TableColumn[]
  groups: readonly TableGroup[]
}

const katakanaOnly: WidthOptions = {
  katakana: true,
  lettersAndNumbers: false,
  symbolsAndSpaces: false
}

type Column = TableColumn & { cell: (row: KanaRow) => TableCell }

const japanese = (heading: string, text: (row: KanaRow) => string): Column => ({
  heading,
  cell: row => ({ text: text(row), lang: 'ja' })
})

const latin = (heading: string, text: (row: KanaRow) => string, quiet?: true): Column => ({
  heading,
  ...(quiet ? { quiet } : {}),
  cell: row => ({ text: text(row), lang: 'ja-Latn' })
})

const hiragana = japanese('Hiragana', row => row.kana)
const katakana = japanese('Katakana', row => toKatakana(row.kana))
const fullWidth = japanese('Full-width', row => toKatakana(row.kana))
const halfWidth = japanese('Half-width', row => fullToHalf(toKatakana(row.kana), katakanaOnly))
const hepburn: Column = {
  heading: 'Romaji',
  cell: row => ({ text: row.romaji, lang: row.romajiInWords ? 'en' : 'ja-Latn' })
}
const typed = latin('Romaji', row => row.typed)
const alsoTyped = latin('Also typed as', row => row.alsoTyped.join(', '), true)
const otherSpellings = latin('Other spellings', row => row.otherSpellings.join(', '), true)

const columnsOf: Record<ConverterSlug, readonly Column[]> = {
  'hiragana-to-katakana': [hiragana, katakana, hepburn],
  'katakana-to-hiragana': [katakana, hiragana, hepburn],
  'romaji-to-kana': [typed, hiragana, katakana, alsoTyped],
  'kana-to-romaji': [hiragana, katakana, hepburn, otherSpellings],
  'half-width-to-full-width': [halfWidth, fullWidth, hepburn],
  'full-width-to-half-width': [fullWidth, halfWidth, hepburn]
}

export const tableRowCount = kanaGroups.reduce((count, group) => count + group.rows.length, 0)

const lines: Record<ConverterPair, string> = {
  kana: `Every hiragana with its katakana partner and romaji, ${tableRowCount} in all.`,
  romaji: `Every kana with its Hepburn spelling and the other spellings people type, ${tableRowCount} in all.`,
  width: `Every katakana in both widths, ${tableRowCount} in all. Hiragana has no half-width form.`
}

const groupLabel = (pair: ConverterPair, id: KanaGroupId, label: string) =>
  pair === 'width' && id === 'extended' ? 'Extended katakana' : label

export function conversionTable(slug: ConverterSlug): ConversionTable {
  const { pair } = converterFor(slug)
  const columns = columnsOf[slug]
  return {
    line: lines[pair],
    columns: columns.map(({ heading, quiet }) => ({ heading, ...(quiet ? { quiet } : {}) })),
    groups: kanaGroups.map(group => ({
      id: group.id,
      label: groupLabel(pair, group.id, group.label),
      rows: group.rows.map(row => columns.map(column => column.cell(row)))
    }))
  }
}

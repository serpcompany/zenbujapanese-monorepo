import { type ConverterPair, converterFor } from './converters'
import { toKatakana } from './kana'
import type { ConverterSlug } from './paths'
import { type KanaGroupId, type KanaRow, kanaGroups } from './reference'
import { fullToHalf, type WidthOptions } from './width'

export interface TableColumn {
  heading: string
  writing: 'japanese' | 'latin'
  quiet?: true
}

interface TableGroup {
  id: KanaGroupId
  label: string
  rows: readonly (readonly string[])[]
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

type Column = TableColumn & { cell: (row: KanaRow) => string }

const japanese = (heading: string, cell: Column['cell']): Column => ({
  heading,
  writing: 'japanese',
  cell
})

const hiragana = japanese('Hiragana', row => row.kana)
const katakana = japanese('Katakana', row => toKatakana(row.kana))
const fullWidth = japanese('Full-width', row => toKatakana(row.kana))
const halfWidth = japanese('Half-width', row => fullToHalf(toKatakana(row.kana), katakanaOnly))
const romaji: Column = { heading: 'Romaji', writing: 'latin', cell: row => row.romaji }
const otherSpellings = (heading: string): Column => ({
  heading,
  writing: 'latin',
  quiet: true,
  cell: row => row.also ?? ''
})

const columnsOf: Record<ConverterSlug, readonly Column[]> = {
  'hiragana-to-katakana': [hiragana, katakana, romaji],
  'katakana-to-hiragana': [katakana, hiragana, romaji],
  'romaji-to-kana': [romaji, hiragana, katakana, otherSpellings('Also typed as')],
  'kana-to-romaji': [hiragana, katakana, romaji, otherSpellings('Other spellings')],
  'half-width-to-full-width': [halfWidth, fullWidth, romaji],
  'full-width-to-half-width': [fullWidth, halfWidth, romaji]
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
    columns: columns.map(({ heading, writing, quiet }) => ({
      heading,
      writing,
      ...(quiet ? { quiet } : {})
    })),
    groups: kanaGroups.map(group => ({
      id: group.id,
      label: groupLabel(pair, group.id, group.label),
      rows: group.rows.map(row => columns.map(column => column.cell(row)))
    }))
  }
}

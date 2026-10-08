import { type ConverterPair, converterFor } from './converters'
import { toKatakana } from './kana'
import type { ConverterSlug } from './paths'
import { type KanaGroup, type KanaGroupId, type KanaRow, kanaGroups } from './reference'
import { fullToHalf, type WidthOptions } from './width'

interface TableColumn {
  heading: string
  wraps?: true
}

interface TableCell {
  text: string
  lang: 'ja' | 'ja-Latn' | 'en'
}

interface ChartEntry {
  kana: string
  pair: string
  romaji: string
}

interface GroupHeading {
  id: KanaGroupId
  tab: string
  label: string
  count: number
}

interface ChartGroup extends GroupHeading {
  kind: 'chart'
  headings: readonly string[]
  rows: readonly { label: string; cells: readonly { column: string; entry: ChartEntry | null }[] }[]
}

interface ListGroup extends GroupHeading {
  kind: 'list'
  columns: readonly TableColumn[]
  rows: readonly { kana: string; cells: readonly TableCell[] }[]
}

export interface ConversionTable {
  line: string
  groups: readonly (ChartGroup | ListGroup)[]
}

const katakanaOnly: WidthOptions = {
  katakana: true,
  lettersAndNumbers: false,
  symbolsAndSpaces: false
}

const katakana = (row: KanaRow) => toKatakana(row.kana)
const halfWidth = (row: KanaRow) => fullToHalf(katakana(row), katakanaOnly)

const pairs: Record<ConverterSlug, readonly ((row: KanaRow) => string)[]> = {
  'hiragana-to-katakana': [row => row.kana, katakana],
  'katakana-to-hiragana': [katakana, row => row.kana],
  'romaji-to-kana': [row => row.kana, katakana],
  'kana-to-romaji': [row => row.kana, katakana],
  'half-width-to-full-width': [halfWidth, katakana],
  'full-width-to-half-width': [katakana, halfWidth]
}

const pairHeadings: Record<ConverterSlug, readonly string[]> = {
  'hiragana-to-katakana': ['Hiragana', 'Katakana'],
  'katakana-to-hiragana': ['Katakana', 'Hiragana'],
  'romaji-to-kana': ['Hiragana', 'Katakana'],
  'kana-to-romaji': ['Hiragana', 'Katakana'],
  'half-width-to-full-width': ['Half-width', 'Full-width'],
  'full-width-to-half-width': ['Full-width', 'Half-width']
}

const spellings = (slug: ConverterSlug, row: KanaRow) =>
  slug === 'romaji-to-kana'
    ? [row.typed, ...row.alsoTyped]
    : slug === 'kana-to-romaji'
      ? [...(row.romajiInWords ? [] : [row.romaji]), ...row.otherSpellings]
      : [row.romaji]

const romajiHeading = (slug: ConverterSlug) => (slug === 'romaji-to-kana' ? 'Typed as' : 'Romaji')

export const tableRowCount = kanaGroups.reduce((count, group) => count + group.rows.length, 0)

const lines: Record<ConverterPair, string> = {
  kana: `Every hiragana with its katakana partner and romaji, ${tableRowCount} in all.`,
  romaji: `Every kana with its Hepburn spelling and the other spellings people type, ${tableRowCount} in all.`,
  width: `Every katakana in both widths, ${tableRowCount} in all. Hiragana has no half-width form.`
}

const groupLabel = (pair: ConverterPair, group: KanaGroup) =>
  pair === 'width' && group.id === 'extended' ? 'Extended katakana' : group.label

function chartEntry(slug: ConverterSlug, row: KanaRow): ChartEntry {
  return {
    kana: row.kana,
    pair: pairs[slug].map(script => script(row)).join(' '),
    romaji: spellings(slug, row).join(', ')
  }
}

function listGroup(slug: ConverterSlug, group: KanaGroup) {
  const [first, second] = pairs[slug]
  const romaji = (row: KanaRow): TableCell => ({
    text: spellings(slug, row).join(', '),
    lang: row.romajiInWords && spellings(slug, row)[0] === row.romaji ? 'en' : 'ja-Latn'
  })
  return {
    kind: 'list' as const,
    columns: [
      ...pairHeadings[slug].map(heading => ({ heading })),
      { heading: romajiHeading(slug), wraps: true as const }
    ],
    rows: group.rows.map(row => ({
      kana: row.kana,
      cells: [
        { text: first(row), lang: 'ja' as const },
        { text: second(row), lang: 'ja' as const },
        romaji(row)
      ]
    }))
  }
}

export function conversionTable(slug: ConverterSlug): ConversionTable {
  const { pair } = converterFor(slug)
  return {
    line: lines[pair],
    groups: kanaGroups.map(group => {
      const heading = {
        id: group.id,
        tab: group.tab,
        label: groupLabel(pair, group),
        count: group.rows.length
      }
      if (!group.chart) return { ...heading, ...listGroup(slug, group) }
      return {
        ...heading,
        kind: 'chart' as const,
        headings: group.chart.headings,
        rows: group.chart.rows.map(row => ({
          label: row.label,
          cells: row.cells.map((cell, index) => ({
            column: group.chart?.headings[index] ?? '',
            entry: cell ? chartEntry(slug, cell) : null
          }))
        }))
      }
    })
  }
}

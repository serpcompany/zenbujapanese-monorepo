import type { KanaRow } from '@zenbu/dictionary-core/browse/kana'
import { type ConverterPair, converterFor } from './converters'
import { toKatakana } from './kana'
import type { ConverterSlug } from './paths'
import {
  entriesIn,
  type KanaEntry,
  type KanaGroup,
  type KanaGroupId,
  kanaGroups
} from './reference'
import { fullToHalf, type WidthOptions } from './width'

export interface ChartGroup {
  id: KanaGroupId
  tab: string
  label: string
  count: number
  sounds: KanaGroup['sounds']
  rows: readonly KanaRow[]
}

interface ConversionChart {
  line: string
  groups: readonly ChartGroup[]
}

const katakanaOnly: WidthOptions = {
  katakana: true,
  lettersAndNumbers: false,
  symbolsAndSpaces: false
}

const katakana = (entry: KanaEntry) => toKatakana(entry.kana)
const halfWidth = (entry: KanaEntry) => fullToHalf(katakana(entry), katakanaOnly)
const hiragana = (entry: KanaEntry) => entry.kana

const pairs: Record<ConverterSlug, readonly ((entry: KanaEntry) => string)[]> = {
  'hiragana-to-katakana': [hiragana, katakana],
  'katakana-to-hiragana': [katakana, hiragana],
  'romaji-to-kana': [hiragana, katakana],
  'kana-to-romaji': [hiragana, katakana],
  'half-width-to-full-width': [halfWidth, katakana],
  'full-width-to-half-width': [katakana, halfWidth]
}

const spellings = (slug: ConverterSlug, entry: KanaEntry) =>
  slug === 'romaji-to-kana'
    ? [entry.typed, ...entry.alsoTyped]
    : slug === 'kana-to-romaji'
      ? [...(entry.romajiInWords ? [] : [entry.romaji]), ...entry.otherSpellings]
      : [entry.romaji]

export const chartKanaCount = kanaGroups.reduce(
  (count, group) => count + entriesIn(group).length,
  0
)

const lines: Record<ConverterPair, string> = {
  kana: `Every hiragana with its katakana partner and romaji, ${chartKanaCount} in all.`,
  romaji: `Every kana with its Hepburn spelling and the other spellings people type, ${chartKanaCount} in all.`,
  width: `Every katakana in both widths, ${chartKanaCount} in all. Hiragana has no half-width form.`
}

const groupLabel = (pair: ConverterPair, group: KanaGroup) =>
  pair === 'width' && group.id === 'extended' ? 'Extended katakana' : group.label

export function conversionChart(slug: ConverterSlug): ConversionChart {
  const { pair } = converterFor(slug)
  return {
    line: lines[pair],
    groups: kanaGroups.map(group => ({
      id: group.id,
      tab: group.tab,
      label: groupLabel(pair, group),
      count: entriesIn(group).length,
      sounds: group.sounds,
      rows: group.rows.map(row => ({
        consonant: row.consonant,
        cells: row.cells.map(entry =>
          entry
            ? {
                kana: pairs[slug].map(script => script(entry)).join(' '),
                romaji: spellings(slug, entry).join(', ')
              }
            : null
        )
      }))
    }))
  }
}

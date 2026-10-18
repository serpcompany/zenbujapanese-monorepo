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
  label: string
  count: number
  sounds: KanaGroup['sounds']
  rows: readonly KanaRow[]
  unchanged: readonly string[]
}

interface ChartTab {
  id: KanaGroupId
  tab: string
  groups: readonly ChartGroup[]
}

const tabs: readonly { id: KanaGroupId; tab: string; groups: readonly KanaGroupId[] }[] = [
  { id: 'basic', tab: 'Basic', groups: ['basic', 'marks', 'small'] },
  { id: 'combinations', tab: 'Combos', groups: ['combinations'] },
  { id: 'extended', tab: 'Katakana', groups: ['extended'] }
]

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
  kana: `Every kana in hiragana and katakana, with its romaji, ${chartKanaCount} in all.`,
  romaji: `Every kana with the romaji that spell it, ${chartKanaCount} in all.`,
  width: `Every katakana in both widths, ${chartKanaCount} in all. Hiragana has no half-width form.`
}

const groupLabel = (pair: ConverterPair, group: KanaGroup) =>
  pair === 'width' && group.id === 'extended' ? 'Extended katakana' : group.label

const pairOf = (slug: ConverterSlug, entry: KanaEntry) =>
  pairs[slug].map(script => script(entry)).join(entry.kana.length > 1 ? '\n' : ' ')

const isUnchanged = (slug: ConverterSlug, entry: KanaEntry) =>
  new Set(pairs[slug].map(script => script(entry))).size === 1

function chartGroup(slug: ConverterSlug, group: KanaGroup): ChartGroup {
  const { pair } = converterFor(slug)
  return {
    id: group.id,
    label: groupLabel(pair, group),
    count: entriesIn(group).length,
    sounds: group.sounds,
    rows: group.rows.map(row => ({
      consonant: row.consonant,
      cells: row.cells.map(entry =>
        entry ? { kana: pairOf(slug, entry), romaji: spellings(slug, entry).join(', ') } : null
      )
    })),
    unchanged: entriesIn(group)
      .filter(entry => isUnchanged(slug, entry))
      .map(entry => pairOf(slug, entry))
  }
}

export function conversionChart(slug: ConverterSlug): { line: string; tabs: ChartTab[] } {
  const groups = new Map(kanaGroups.map(group => [group.id, chartGroup(slug, group)]))
  return {
    line: lines[converterFor(slug).pair],
    tabs: tabs.map(({ id, tab, groups: ids }) => ({
      id,
      tab,
      groups: ids.flatMap(each => groups.get(each) ?? [])
    }))
  }
}

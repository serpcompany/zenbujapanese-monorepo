import type { KanaRow } from '@zenbu/dictionary-core/browse/kana'
import type { Locale } from '@/lib/i18n/config'
import { type Dictionary, getDictionary } from '@/lib/i18n/dictionary'
import { fill, formatNumber } from '@/lib/i18n/format'
import { converterFor } from './converters'
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

type ChartText = Dictionary['tools']['chart']

const tabs: readonly { id: keyof ChartText['tabs']; groups: readonly KanaGroupId[] }[] = [
  { id: 'basic', groups: ['basic', 'marks', 'small'] },
  { id: 'combinations', groups: ['combinations'] },
  { id: 'extended', groups: ['extended'] }
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

const spellings = (slug: ConverterSlug, entry: KanaEntry, text: ChartText) =>
  slug === 'romaji-to-kana'
    ? [entry.typed, ...entry.alsoTyped]
    : slug === 'kana-to-romaji'
      ? [...(entry.romajiInWords ? [] : [entry.romaji]), ...entry.otherSpellings]
      : [entry.romajiInWords ? text.smallTsu : entry.romaji]

export const chartKanaCount = kanaGroups.reduce(
  (count, group) => count + entriesIn(group).length,
  0
)

const groupLabel = (slug: ConverterSlug, group: KanaGroup, text: ChartText) =>
  converterFor(slug).pair === 'width' && group.id === 'extended'
    ? text.extendedKatakana
    : text.groups[group.id]

const pairOf = (slug: ConverterSlug, entry: KanaEntry) =>
  pairs[slug].map(script => script(entry)).join(entry.kana.length > 1 ? '\n' : ' ')

const isUnchanged = (slug: ConverterSlug, entry: KanaEntry) =>
  new Set(pairs[slug].map(script => script(entry))).size === 1

function chartGroup(slug: ConverterSlug, group: KanaGroup, text: ChartText): ChartGroup {
  return {
    id: group.id,
    label: groupLabel(slug, group, text),
    count: entriesIn(group).length,
    sounds: group.sounds,
    rows: group.rows.map(row => ({
      consonant: row.consonant,
      cells: row.cells.map(entry =>
        entry
          ? { kana: pairOf(slug, entry), romaji: spellings(slug, entry, text).join(', ') }
          : null
      )
    })),
    unchanged: entriesIn(group)
      .filter(entry => isUnchanged(slug, entry))
      .map(entry => pairOf(slug, entry))
  }
}

export function conversionChart(
  slug: ConverterSlug,
  locale: Locale
): { line: string; tabs: ChartTab[] } {
  const text = getDictionary(locale).tools.chart
  const groups = new Map(kanaGroups.map(group => [group.id, chartGroup(slug, group, text)]))
  return {
    line: fill(text.lines[converterFor(slug).pair], {
      count: formatNumber(chartKanaCount, locale)
    }),
    tabs: tabs.map(({ id, groups: ids }) => ({
      id,
      tab: text.tabs[id],
      groups: ids.flatMap(each => groups.get(each) ?? [])
    }))
  }
}

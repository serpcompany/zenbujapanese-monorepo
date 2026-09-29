// The kanji page, as the app's kanji detail shows it (KanjiDetailView.swift), with its words from
// LookupClient.swift's `entries(containingKanji:)` and its elements from
// KanjiElementLookupClient.swift.

import type {
  KanjiElementRow,
  KanjiReadingRow,
  KanjiRows,
  KanjiStructureRow,
  KanjiWordRow
} from './rows'
import { type RubySegment, rubySegments } from './ruby'
import { type StrokeOrder, strokeOrder } from './strokes'
import { hiragana, isKanjiCharacter } from './text'

/** How many words the app lists for a kanji (`entries(containingKanji:)` binds 24). */
export const kanjiWordLimit = 24

export interface KanjiWord {
  entSeq: number
  headword: string
  reading: string
  ruby: RubySegment[]
  summary: string
}

export interface KanjiReading {
  kind: KanjiReadingRow['kind']
  /** On, Kun, or Name. */
  label: string
  value: string
  /** Up to three of the kanji's words read this way. */
  words: KanjiWord[]
}

/** `KanjiElementRole`. */
export type KanjiElementRole = 'meaningStructure' | 'sound' | 'soundPattern'

export interface KanjiElement {
  character: string
  role: KanjiElementRole
  /** The role in sentence case; the app shows it in capitals. */
  roleLabel: string
  /** Up to three meanings, or the element's linked on-readings when it has none. */
  description: string
}

export interface KanjiDetail {
  character: string
  /**
   * KanjiOverview's metrics, as the app shows them: strokes, then grade and JLPT when KANJIDIC2
   * has them. JLPT reads as the app writes it, `N` and KANJIDIC2's level (要 is N2).
   */
  stats: { label: string; value: string }[]
  meanings: string[]
  readings: KanjiReading[]
  /** KRADFILE's components, which the app lists only when Kanjium has no elements. */
  components: string[]
  elements: KanjiElement[]
  words: KanjiWord[]
  /** The stroke order KanjiStrokeOrderView draws; null when there's none, and no control shows. */
  strokeOrder: StrokeOrder | null
  /** What Share sends: the kanji, its readings, and its meanings. */
  shareText: string
}

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)

/**
 * `entries(containingKanji:)`, over the candidate rows fixtures hold: `kanjiCandidateRowsSQL` groups the entries written with the kanji
 * by semantic fingerprint and orders the groups by, in turn: a headword starting with the kanji,
 * the shortest headword, any common entry, the highest rank score, then the fingerprint. Each of
 * the first 24 groups shows as its entry with the smallest ID (`normalizedEntry`).
 */
export function kanjiWords(
  character: string,
  rows: readonly KanjiWordRow[],
  limit = kanjiWordLimit
): KanjiWordRow[] {
  const groups = new Map<string, { entries: KanjiWordRow[]; matching: KanjiWordRow[] }>()
  for (const row of rows) {
    const group = groups.get(row.fingerprint) ?? { entries: [], matching: [] }
    group.entries.push(row)
    if (row.containsKanji) group.matching.push(row)
    groups.set(row.fingerprint, group)
  }
  const ranked = [...groups]
    .filter(([, group]) => group.matching.length > 0)
    .map(([fingerprint, { entries, matching }]) => ({
      fingerprint,
      entries,
      // SQLite's instr() and length() count characters (code points).
      startsLater: Math.min(...matching.map(row => (row.headword.startsWith(character) ? 0 : 1))),
      length: Math.min(...matching.map(row => [...row.headword].length)),
      isCommon: matching.some(row => row.isCommon) ? 1 : 0,
      rankScore: Math.max(...matching.map(row => row.rankScore))
    }))
    .sort(
      (left, right) =>
        left.startsLater - right.startsLater ||
        left.length - right.length ||
        right.isCommon - left.isCommon ||
        right.rankScore - left.rankScore ||
        // The fingerprint is a BLOB; lowercase hex sorts the same as its bytes.
        compareText(left.fingerprint, right.fingerprint)
    )
  return ranked
    .slice(0, limit)
    .map(({ entries }) =>
      entries.reduce((smallest, row) => (row.id < smallest.id ? row : smallest))
    )
}

/**
 * KanjiReadingsSection's `words(matching:)`: up to three of the kanji's words whose reading, in
 * hiragana, starts with the reading's stem (い.る gives いる).
 */
export function wordsForReading<Word extends { reading: string }>(
  reading: KanjiReadingRow,
  words: readonly Word[]
): Word[] {
  const stem = hiragana(reading.value.replaceAll('.', '').replaceAll('-', ''))
  if (!stem) return []
  return words.filter(word => hiragana(word.reading).startsWith(stem)).slice(0, 3)
}

const roleLabels: Record<KanjiElementRole, string> = {
  meaningStructure: 'Meaning / structure',
  sound: 'Sound',
  soundPattern: 'Sound pattern'
}

/**
 * `KanjiElementReferenceData.elements(_:)`: each of the kanji's element glyphs that is a kanji and
 * has an element entry. The explicit phonetic element is Sound; an element whose common linked
 * on-readings share one with the kanji is Sound pattern; the rest are Meaning / structure.
 */
export function kanjiElements(
  structure: KanjiStructureRow | null,
  elements: readonly KanjiElementRow[]
): KanjiElement[] {
  if (!structure) return []
  return structure.elementGlyphs.flatMap(glyph => {
    const element = elements.find(candidate => candidate.glyph === glyph)
    if (!element || !isKanjiCharacter(glyph)) return []
    const role: KanjiElementRole =
      structure.explicitPhoneticElement === glyph
        ? 'sound'
        : element.commonLinkedOnReadings.some(reading => structure.onReadings.includes(reading))
          ? 'soundPattern'
          : 'meaningStructure'
    // KanjiElementsSection: three meanings, else the linked on-readings.
    const description =
      element.meanings.length > 0
        ? element.meanings.slice(0, 3).join(', ')
        : element.commonLinkedOnReadings.length > 0
          ? `Linked on-readings: ${element.commonLinkedOnReadings.join(', ')}`
          : ''
    return [{ character: glyph, role, roleLabel: roleLabels[role], description }]
  })
}

const readingLabels = { on: 'On', kun: 'Kun', name: 'Name' } as const

/** KanjiDetailView's `shareText`. */
export function kanjiShareText(
  kanji: Pick<KanjiRows['kanji'], 'character' | 'readings' | 'meanings'>
) {
  const readings = kanji.readings.map(reading => reading.value).join('、')
  const heading = readings ? `${kanji.character}【${readings}】` : kanji.character
  return [heading, kanji.meanings.join(', ')].filter(Boolean).join('\n')
}

/**
 * The stroke order, or null when the data can't be decoded: the app then shows no stroke order
 * (KanjiDetailView's `strokeOrderAction`), and the page must still render. The import refuses such
 * data, so this is only a safeguard.
 */
function drawableStrokeOrder(row: NonNullable<KanjiRows['strokes']>): StrokeOrder | null {
  try {
    return strokeOrder(row)
  } catch {
    return null
  }
}

/** Everything the kanji page shows, in the app's section order. */
export function kanjiDetail(rows: KanjiRows): KanjiDetail {
  const { kanji } = rows
  const words: KanjiWord[] = rows.words.map(row => ({
    entSeq: row.entSeq,
    headword: row.headword,
    reading: row.reading,
    ruby: rubySegments(row.headword, row.reading),
    summary: row.summary
  }))
  const elements = kanjiElements(rows.structure, rows.elements)
  return {
    character: kanji.character,
    stats: [
      { label: kanji.strokeCount === 1 ? 'Stroke' : 'Strokes', value: `${kanji.strokeCount}` },
      ...(kanji.grade === null ? [] : [{ label: 'Grade', value: `${kanji.grade}` }]),
      ...(kanji.jlpt === null ? [] : [{ label: 'JLPT', value: `N${kanji.jlpt}` }])
    ],
    meanings: kanji.meanings,
    readings: kanji.readings.map(reading => ({
      kind: reading.kind,
      label: readingLabels[reading.kind],
      value: reading.value,
      words: wordsForReading(reading, words)
    })),
    components: elements.length === 0 ? kanji.components : [],
    elements,
    words,
    strokeOrder: rows.strokes ? drawableStrokeOrder(rows.strokes) : null,
    shareText: kanjiShareText(kanji)
  }
}

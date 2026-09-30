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
  label: string
  value: string
  words: KanjiWord[]
}

export type KanjiElementRole = 'meaningStructure' | 'sound' | 'soundPattern'

export interface KanjiElement {
  character: string
  role: KanjiElementRole
  roleLabel: string
  description: string
}

export interface KanjiDetail {
  character: string
  stats: { label: string; value: string }[]
  meanings: string[]
  readings: KanjiReading[]
  components: string[]
  elements: KanjiElement[]
  words: KanjiWord[]
  strokeOrder: StrokeOrder | null
  shareText: string
}

const compareLowercaseHex = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0
const codePointLength = (value: string) => [...value].length
const wordsPerReading = 3
const meaningsPerElement = 3

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
      startsLater: Math.min(...matching.map(row => (row.headword.startsWith(character) ? 0 : 1))),
      length: Math.min(...matching.map(row => codePointLength(row.headword))),
      isCommon: matching.some(row => row.isCommon) ? 1 : 0,
      rankScore: Math.max(...matching.map(row => row.rankScore))
    }))
    .sort(
      (left, right) =>
        left.startsLater - right.startsLater ||
        left.length - right.length ||
        right.isCommon - left.isCommon ||
        right.rankScore - left.rankScore ||
        compareLowercaseHex(left.fingerprint, right.fingerprint)
    )
  return ranked
    .slice(0, limit)
    .map(({ entries }) =>
      entries.reduce((smallest, row) => (row.id < smallest.id ? row : smallest))
    )
}

export function wordsForReading<Word extends { reading: string }>(
  reading: KanjiReadingRow,
  words: readonly Word[]
): Word[] {
  const stem = hiragana(reading.value.replaceAll('.', '').replaceAll('-', ''))
  if (!stem) return []
  return words.filter(word => hiragana(word.reading).startsWith(stem)).slice(0, wordsPerReading)
}

const roleLabels: Record<KanjiElementRole, string> = {
  meaningStructure: 'Meaning / structure',
  sound: 'Sound',
  soundPattern: 'Sound pattern'
}

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
    const description =
      element.meanings.length > 0
        ? element.meanings.slice(0, meaningsPerElement).join(', ')
        : element.commonLinkedOnReadings.length > 0
          ? `Linked on-readings: ${element.commonLinkedOnReadings.join(', ')}`
          : ''
    return [{ character: glyph, role, roleLabel: roleLabels[role], description }]
  })
}

const readingLabels = { on: 'On', kun: 'Kun', name: 'Name' } as const

export function kanjiShareText(
  kanji: Pick<KanjiRows['kanji'], 'character' | 'readings' | 'meanings'>
) {
  const readings = kanji.readings.map(reading => reading.value).join('、')
  const heading = readings ? `${kanji.character}【${readings}】` : kanji.character
  return [heading, kanji.meanings.join(', ')].filter(Boolean).join('\n')
}

function drawableStrokeOrder(row: NonNullable<KanjiRows['strokes']>): StrokeOrder | null {
  try {
    return strokeOrder(row)
  } catch {
    return null
  }
}

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

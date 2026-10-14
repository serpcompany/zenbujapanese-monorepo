import { canonicalEntry } from '../search/ranked-entries'
import type {
  KanjiElementRow,
  KanjiReadingRow,
  KanjiRows,
  KanjiStructureRow,
  KanjiWordRow
} from './rows'
import { type RubySegment, rubySegments } from './ruby'
import { glossSeparator, type Section, sections } from './sections'
import { type StrokeOrder, strokeOrder } from './strokes'
import { hiragana, isKanjiCharacter } from './text'

export const kanjiWordLimit = 24

export interface KanjiWord {
  id: string
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
  wordsText: string
  spoken: string | null
}

type KanjiElementRole = 'meaningStructure' | 'sound' | 'soundPattern'

export interface KanjiElement {
  character: string
  role: KanjiElementRole
  roleLabel: string
  meanings: string[]
  linkedOnReadings: string[]
  description: string
  spoken: string
}

interface KanjiStat {
  kind: 'strokes' | 'grade' | 'jlpt'
  label: string
  value: string
  spoken: string
}

const kanjiSectionTitles = {
  readings: 'Readings',
  components: 'Components',
  elements: 'Elements',
  lists: 'Lists',
  notes: 'Notes',
  words: 'Words'
}

export type KanjiSectionKind = keyof typeof kanjiSectionTitles

interface KanjiContent {
  readings: readonly unknown[]
  components: readonly unknown[]
  elements: readonly unknown[]
  words: readonly unknown[]
}

function kanjiSections(content: KanjiContent): Section<KanjiSectionKind>[] {
  return sections(kanjiSectionTitles, {
    readings: content.readings.length > 0,
    components: content.components.length > 0,
    elements: content.elements.length > 0,
    words: content.words.length > 0
  })
}

export const kanjiSectionsWithoutContent = kanjiSections({
  readings: [],
  components: [],
  elements: [],
  words: []
})

export interface KanjiDetail {
  sections: Section<KanjiSectionKind>[]
  character: string
  stats: KanjiStat[]
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
  return ranked.slice(0, limit).flatMap(({ entries }) => canonicalEntry(entries) ?? [])
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
    const meanings = element.meanings.slice(0, meaningsPerElement)
    const linkedOnReadings = meanings.length > 0 ? [] : element.commonLinkedOnReadings
    const description =
      meanings.length > 0
        ? meanings.join(', ')
        : linkedOnReadings.length > 0
          ? `Linked on-readings: ${linkedOnReadings.join(', ')}`
          : ''
    const roleLabel = roleLabels[role]
    const spoken = `Element ${glyph}, ${roleLabel.toLowerCase()}, ${meanings.join(', ')}`
    return [{ character: glyph, role, roleLabel, meanings, linkedOnReadings, description, spoken }]
  })
}

const readingLabels = { on: 'On', kun: 'Kun', name: 'Name' } as const

function kanjiShareText(kanji: Pick<KanjiRows['kanji'], 'character' | 'readings' | 'meanings'>) {
  const readings = kanji.readings.map(reading => reading.value).join('、')
  const heading = readings ? `${kanji.character}【${readings}】` : kanji.character
  return [heading, kanji.meanings.join(', ')].filter(Boolean).join('\n')
}

function kanjiStats(
  kanji: Pick<KanjiRows['kanji'], 'strokeCount' | 'grade' | 'jlpt'>
): KanjiStat[] {
  const strokes = kanji.strokeCount === 1 ? 'Stroke' : 'Strokes'
  const stats: KanjiStat[] = [
    {
      kind: 'strokes',
      label: strokes,
      value: `${kanji.strokeCount}`,
      spoken: `${kanji.strokeCount} ${strokes}`
    }
  ]
  if (kanji.grade !== null) {
    stats.push({
      kind: 'grade',
      label: 'Grade',
      value: `${kanji.grade}`,
      spoken: `Grade ${kanji.grade}`
    })
  }
  if (kanji.jlpt !== null) {
    stats.push({
      kind: 'jlpt',
      label: 'JLPT',
      value: `N${kanji.jlpt}`,
      spoken: `JLPT N${kanji.jlpt}`
    })
  }
  return stats
}

function drawableStrokeOrder(row: NonNullable<KanjiRows['strokes']>): StrokeOrder | null {
  try {
    return strokeOrder(row)
  } catch {
    return null
  }
}

const wordsTextSeparator = '   '

type GlossedWord = Pick<KanjiWord, 'headword' | 'summary'>

export function kanjiReadingText(
  label: string,
  value: string,
  words: readonly GlossedWord[]
): Pick<KanjiReading, 'wordsText' | 'spoken'> {
  const [first] = words
  return {
    wordsText: words
      .map(word => `${word.headword}${glossSeparator}${word.summary}`)
      .join(wordsTextSeparator),
    spoken: first ? `${label} reading ${value}, ${first.headword}, ${first.summary}` : null
  }
}

function kanjiReading(reading: KanjiReadingRow, words: readonly KanjiWord[]): KanjiReading {
  const label = readingLabels[reading.kind]
  const shown = wordsForReading(reading, words)
  return {
    kind: reading.kind,
    label,
    value: reading.value,
    words: shown,
    ...kanjiReadingText(label, reading.value, shown)
  }
}

export function savedKanjiReading(detail: Pick<KanjiDetail, 'readings'>): string {
  return detail.readings[0]?.value ?? ''
}

export function kanjiDetail(rows: KanjiRows): KanjiDetail {
  const { kanji } = rows
  const words: KanjiWord[] = rows.words.map(row => ({
    id: row.id,
    entSeq: row.entSeq,
    headword: row.headword,
    reading: row.reading,
    ruby: rubySegments(row.headword, row.reading),
    summary: row.summary
  }))
  const elements = kanjiElements(rows.structure, rows.elements)
  const readings = kanji.readings.map(reading => kanjiReading(reading, words))
  const components = elements.length === 0 ? kanji.components : []
  return {
    sections: kanjiSections({ readings, components, elements, words }),
    character: kanji.character,
    stats: kanjiStats(kanji),
    meanings: kanji.meanings,
    readings,
    components,
    elements,
    words,
    strokeOrder: rows.strokes ? drawableStrokeOrder(rows.strokes) : null,
    shareText: kanjiShareText(kanji)
  }
}

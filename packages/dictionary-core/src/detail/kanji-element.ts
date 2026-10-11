import type { KanjiElementKanjiRow, KanjiElementPageRows } from './rows'
import { isKanjiCharacter } from './text'

const meaningsPerKanji = 3

export interface KanjiElementContribution {
  character: string
  meanings: string[]
  onReadings: string[]
  spoken: string
}

export interface KanjiElementDetail {
  glyph: string
  meanings: string[]
  explanation: string | null
  soundPatterns: string | null
  alternatives: string[]
  standalone: KanjiElementContribution | null
  containing: KanjiElementContribution[]
  structureSource: string
  metadataSource: string
}

const unified = (character: string) => character.normalize('NFC').codePointAt(0) ?? 0

function mostFrequentFirst(left: KanjiElementKanjiRow, right: KanjiElementKanjiRow): number {
  if (left.frequencyRank !== right.frequencyRank) {
    if (left.frequencyRank === null) return 1
    if (right.frequencyRank === null) return -1
    return left.frequencyRank - right.frequencyRank
  }
  return unified(left.character) - unified(right.character)
}

function contribution(row: KanjiElementKanjiRow): KanjiElementContribution {
  return {
    character: row.character,
    meanings: row.meanings.slice(0, meaningsPerKanji),
    onReadings: row.onReadings,
    spoken: [row.character, ...row.meanings, ...row.onReadings].join(', ')
  }
}

export function kanjiElementDetail(rows: KanjiElementPageRows): KanjiElementDetail {
  const kanji = (listed: readonly KanjiElementKanjiRow[]) =>
    listed.filter(row => isKanjiCharacter(row.character))
  const standalone = kanji(rows.family).sort(mostFrequentFirst).at(0)
  return {
    glyph: rows.glyph,
    meanings: rows.meanings,
    explanation:
      rows.meanings.length > 0
        ? `This element contributes forms associated with ${rows.meanings.join(', ')}.`
        : null,
    soundPatterns:
      rows.commonLinkedOnReadings.length > 0
        ? `Linked on-readings: ${rows.commonLinkedOnReadings.join(', ')}`
        : null,
    alternatives: rows.alternatives.filter(isKanjiCharacter),
    standalone: standalone ? contribution(standalone) : null,
    containing: kanji(rows.containing)
      .filter(row => !standalone || unified(row.character) !== unified(standalone.character))
      .map(contribution),
    structureSource: rows.structureSource,
    metadataSource: rows.metadataSource
  }
}

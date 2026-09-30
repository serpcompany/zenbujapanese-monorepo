// The app's bundled kanji files, which a client reads and hands the core parsed:
// KanjiReferenceData.json (KANJIDIC2 and KRADFILE) and KanjiElementReferenceData.json (Kanjium).
// Checked as the app's clients check them, then read into the detail core's rows.

import type {
  KanjiElementRow,
  KanjiGlossRow,
  KanjiReadingRow,
  KanjiRow,
  KanjiStructureRow
} from '../detail/rows'

/** A kanji in KanjiReferenceData.json's `entries`. */
export interface KanjiReferenceEntry {
  character: string
  strokeCount: number
  grade: number | null
  jlpt: number | null
  frequencyRank: number | null
  meanings: string[]
  readings: KanjiReadingRow[]
  components: string[]
}

export interface KanjiReferenceFile {
  metadataSourceIdentity: string
  componentSourceIdentity: string
  entries: KanjiReferenceEntry[]
}

/** A kanji in KanjiElementReferenceData.json's `kanji`. */
export interface KanjiStructureEntry {
  character: string
  meanings: string[]
  onReadings: string[]
  frequencyRank: number | null
  elementGlyphs: string[]
  explicitPhoneticElement: string | null
}

/** An element in KanjiElementReferenceData.json's `elements`. */
export interface KanjiElementEntry {
  glyph: string
  alternatives: string[]
  meanings: string[]
  onReadings: string[]
  commonLinkedOnReadings: string[]
  containingCharacters: string[]
}

export interface KanjiElementFile {
  schema: string
  kanji: KanjiStructureEntry[]
  elements: KanjiElementEntry[]
}

const referenceSources = {
  metadataSourceIdentity: 'edrdg.kanjidic2',
  componentSourceIdentity: 'edrdg.kradfile'
} as const
const elementsSchema = 'zenbu.kanji-elements.v1'

/** Code point order, as SQLite's BINARY collation sorts UTF-8 text. */
export function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left)
  const b = Array.from(right)
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const difference = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

/** DictionaryEntry.swift's isCJKUnifiedIdeograph, for one code point. */
export const isCJKUnifiedIdeograph = (character: string) => {
  const code = character.codePointAt(0) ?? 0
  return code >= 0x3400 && code <= 0x9fff
}

export class KanjiData {
  private readonly byCharacter: Map<string, KanjiReferenceEntry>
  private readonly structures: Map<string, KanjiStructureEntry>
  private readonly elementsByGlyph: Map<string, KanjiElementEntry>

  /** Throws unless both files are the versions the core reads. */
  constructor(reference: KanjiReferenceFile, elements: KanjiElementFile) {
    for (const [key, value] of Object.entries(referenceSources)) {
      const recorded = reference[key as keyof typeof referenceSources]
      if (recorded !== value) {
        throw new Error(
          `Refusing the language data: KanjiReferenceData.json's ${key} is ${recorded}, not ${value}`
        )
      }
    }
    if (elements.schema !== elementsSchema) {
      throw new Error(
        `Refusing the language data: KanjiElementReferenceData.json is ${elements.schema}; the core reads ${elementsSchema}`
      )
    }
    this.byCharacter = new Map(reference.entries.map(entry => [entry.character, entry]))
    this.structures = new Map(elements.kanji.map(entry => [entry.character, entry]))
    this.elementsByGlyph = new Map(elements.elements.map(element => [element.glyph, element]))
  }

  /** Whether the kanji has a page: every kanji KanjiReferenceData.json lists does. */
  has(character: string): boolean {
    return this.byCharacter.has(character)
  }

  row(character: string): KanjiRow | null {
    const entry = this.byCharacter.get(character)
    if (!entry) return null
    return {
      character: entry.character,
      strokeCount: entry.strokeCount,
      grade: entry.grade,
      jlpt: entry.jlpt,
      meanings: entry.meanings,
      readings: entry.readings.map(({ value, kind }) => ({ value, kind })),
      components: entry.components
    }
  }

  /** A kanji with no meanings or readings stays out of search engines (#465). */
  isIndexable(character: string): boolean {
    const entry = this.byCharacter.get(character)
    return entry !== undefined && (entry.meanings.length > 0 || entry.readings.length > 0)
  }

  /** Every kanji search engines may index, in code point order. */
  indexableCharacters(): string[] {
    return [...this.byCharacter.keys()]
      .filter(character => this.isIndexable(character))
      .sort(compareCodePoints)
  }

  /**
   * KANJIDIC2's meanings and readings for the CJK unified ideographs in a word's forms, first
   * occurrence first: the word page's Kanji sections.
   */
  glossRows(forms: string[]): KanjiGlossRow[] {
    const characters: string[] = []
    for (const form of forms) {
      for (const character of form) {
        if (isCJKUnifiedIdeograph(character) && !characters.includes(character)) {
          characters.push(character)
        }
      }
    }
    return characters.flatMap(character => {
      const entry = this.byCharacter.get(character)
      if (!entry) return []
      return [
        {
          character,
          meanings: entry.meanings,
          readings: entry.readings.map(({ value, kind }) => ({ value, kind }))
        }
      ]
    })
  }

  /** Kanjium's structure for the kanji; null when it has none. */
  structure(character: string): KanjiStructureRow | null {
    const entry = this.structures.get(character)
    if (!entry) return null
    return {
      onReadings: entry.onReadings,
      elementGlyphs: entry.elementGlyphs,
      explicitPhoneticElement: entry.explicitPhoneticElement
    }
  }

  /** The elements a structure names, in its order, where the file describes them. */
  elementRows(glyphs: string[]): KanjiElementRow[] {
    return glyphs.flatMap(glyph => {
      const element = this.elementsByGlyph.get(glyph)
      return element
        ? [
            {
              glyph,
              meanings: element.meanings,
              commonLinkedOnReadings: element.commonLinkedOnReadings
            }
          ]
        : []
    })
  }
}

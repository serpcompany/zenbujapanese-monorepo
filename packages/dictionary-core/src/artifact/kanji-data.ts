import type {
  KanjiElementRow,
  KanjiGlossRow,
  KanjiReadingRow,
  KanjiRow,
  KanjiStructureRow
} from '../detail/rows'

export interface KanjiReferenceEntry {
  character: string
  strokeCount: number
  grade: number | null
  wallerJlptLevel: number | null
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

export interface KanjiStructureEntry {
  character: string
  meanings: string[]
  onReadings: string[]
  frequencyRank: number | null
  elementGlyphs: string[]
  explicitPhoneticElement: string | null
}

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

const isCJKUnifiedIdeograph = (character: string) => {
  const code = character.codePointAt(0) ?? 0
  return code >= 0x3400 && code <= 0x9fff
}

export class KanjiData {
  private readonly byCharacter: Map<string, KanjiReferenceEntry>
  private readonly structures: Map<string, KanjiStructureEntry>
  private readonly elementsByGlyph: Map<string, KanjiElementEntry>

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

  has(character: string): boolean {
    return this.byCharacter.has(character)
  }

  entries(): KanjiReferenceEntry[] {
    return [...this.byCharacter.values()]
  }

  row(character: string): KanjiRow | null {
    const entry = this.byCharacter.get(character)
    if (!entry) return null
    return {
      character: entry.character,
      strokeCount: entry.strokeCount,
      grade: entry.grade,
      jlpt: entry.wallerJlptLevel,
      meanings: entry.meanings,
      readings: entry.readings.map(({ value, kind }) => ({ value, kind })),
      components: entry.components
    }
  }

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

  structure(character: string): KanjiStructureRow | null {
    const entry = this.structures.get(character)
    if (!entry) return null
    return {
      onReadings: entry.onReadings,
      elementGlyphs: entry.elementGlyphs,
      explicitPhoneticElement: entry.explicitPhoneticElement
    }
  }

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

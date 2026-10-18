import type {
  KanjiElementKanjiRow,
  KanjiElementPageRows,
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

export interface KanjiSources {
  metadataSourceIdentity: string
  componentSourceIdentity: string
  schema: string
}

export interface KanjiElementSources {
  snapshot: string
  structureSourceIdentity: string
  metadataSourceIdentity: string
  metadataSourceSnapshot: string
}

function checkReferenceSources(sources: Partial<Record<keyof typeof referenceSources, unknown>>) {
  for (const [key, value] of Object.entries(referenceSources)) {
    const recorded = sources[key as keyof typeof referenceSources]
    if (recorded !== value) {
      throw new Error(
        `Refusing the language data: KanjiReferenceData.json's ${key} is ${recorded}, not ${value}`
      )
    }
  }
}

const isRank = (value: unknown) => value === null || Number.isInteger(value)

const isReading = (reading: Partial<KanjiReadingRow> | null) =>
  typeof reading?.value === 'string' && typeof reading.kind === 'string'

const isReferenceEntry = (entry: Partial<KanjiReferenceEntry> | null) =>
  typeof entry?.character === 'string' &&
  isRank(entry.grade) &&
  isRank(entry.frequencyRank) &&
  Array.isArray(entry.meanings) &&
  entry.meanings.every(meaning => typeof meaning === 'string') &&
  Array.isArray(entry.readings) &&
  entry.readings.every(isReading)

export function checkedKanjiReference(read: unknown): KanjiReferenceFile {
  const file = (read ?? {}) as Partial<KanjiReferenceFile>
  checkReferenceSources(file)
  if (!Array.isArray(file.entries) || !file.entries.every(isReferenceEntry)) {
    throw new Error(
      'Refusing the language data: KanjiReferenceData.json does not list kanji as the core reads them'
    )
  }
  return file as KanjiReferenceFile
}

export function checkKanjiSources(sources: KanjiSources): void {
  checkReferenceSources(sources)
  if (sources.schema !== elementsSchema) {
    throw new Error(
      `Refusing the language data: KanjiElementReferenceData.json is ${sources.schema}; the core reads ${elementsSchema}`
    )
  }
}

export interface KanjiLookup {
  entry(character: string): KanjiReferenceEntry | undefined
  structure(character: string): KanjiStructureEntry | undefined
  element(glyph: string): KanjiElementEntry | undefined
}

export class KanjiReference {
  constructor(private readonly lookup: KanjiLookup) {}

  row(character: string): KanjiRow | null {
    const entry = this.lookup.entry(character)
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
      const entry = this.lookup.entry(character)
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
    const entry = this.lookup.structure(character)
    if (!entry) return null
    return {
      onReadings: entry.onReadings,
      elementGlyphs: entry.elementGlyphs,
      explicitPhoneticElement: entry.explicitPhoneticElement
    }
  }

  elementPageRows(glyph: string, sources: KanjiElementSources): KanjiElementPageRows | null {
    const element = this.lookup.element(glyph)
    if (!element) return null
    const kanji = (characters: readonly string[]): KanjiElementKanjiRow[] =>
      characters.flatMap(character => {
        const entry = this.lookup.structure(character)
        return entry
          ? [
              {
                character: entry.character,
                meanings: entry.meanings,
                onReadings: entry.onReadings,
                frequencyRank: entry.frequencyRank
              }
            ]
          : []
      })
    return {
      glyph,
      meanings: element.meanings,
      commonLinkedOnReadings: element.commonLinkedOnReadings,
      alternatives: element.alternatives,
      family: kanji([glyph, ...element.alternatives]),
      containing: kanji(element.containingCharacters),
      structureSource: `${sources.structureSourceIdentity} ${sources.snapshot}`,
      metadataSource: `${sources.metadataSourceIdentity} ${sources.metadataSourceSnapshot}`
    }
  }

  elementRows(glyphs: string[]): KanjiElementRow[] {
    return glyphs.flatMap(glyph => {
      const element = this.lookup.element(glyph)
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

export class KanjiData extends KanjiReference {
  private readonly byCharacter: Map<string, KanjiReferenceEntry>

  constructor(reference: KanjiReferenceFile, elements: KanjiElementFile) {
    checkKanjiSources({ ...reference, schema: elements.schema })
    const byCharacter = new Map(reference.entries.map(entry => [entry.character, entry]))
    const structures = new Map(elements.kanji.map(entry => [entry.character, entry]))
    const elementsByGlyph = new Map(elements.elements.map(element => [element.glyph, element]))
    super({
      entry: character => byCharacter.get(character),
      structure: character => structures.get(character),
      element: glyph => elementsByGlyph.get(glyph)
    })
    this.byCharacter = byCharacter
  }

  has(character: string): boolean {
    return this.byCharacter.has(character)
  }

  entries(): KanjiReferenceEntry[] {
    return [...this.byCharacter.values()]
  }
}
